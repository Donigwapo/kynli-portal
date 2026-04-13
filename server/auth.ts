/**
 * server/auth.ts
 * Supabase email+password auth routes.
 * Replaces Manus OAuth entirely.
 *
 * POST /api/auth/login   — email + password → session cookie
 * POST /api/auth/logout  — clear session cookie
 * GET  /api/auth/me      — return current portal_user from cookie
 */

import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { supabase, getPortalUserByUid, getPortalUserByEmail, type PortalUser } from "./supabase";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-change-me");
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ─── Session token helpers ────────────────────────────────────────────────────

export async function createPortalSessionToken(user: PortalUser): Promise<string> {
  return new SignJWT({
    uid: user.supabase_uid,
    email: user.email,
    role: user.role,
    tenant_slug: user.tenant_slug,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
}

export async function verifyPortalSessionToken(token: string): Promise<{
  uid: string;
  email: string;
  role: "client" | "admin";
  tenant_slug: string | null;
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as {
      uid: string;
      email: string;
      role: "client" | "admin";
      tenant_slug: string | null;
    };
  } catch {
    return null;
  }
}

// ─── Get current user from request ───────────────────────────────────────────

export async function getPortalUserFromRequest(req: Request): Promise<PortalUser | null> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  const payload = await verifyPortalSessionToken(token);
  if (!payload) return null;

  // Fetch fresh user data from DB
  const user = await getPortalUserByEmail(payload.email);
  return user;
}

// ─── Register auth routes ─────────────────────────────────────────────────────

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    try {
      // Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Fetch portal user record
      let portalUser = await getPortalUserByUid(authData.user.id);

      // Fallback: look up by email if uid not linked yet
      if (!portalUser) {
        portalUser = await getPortalUserByEmail(email);
        if (portalUser && !portalUser.supabase_uid) {
          // Link the UID
          await supabase
            .from("portal_users")
            .update({ supabase_uid: authData.user.id, updated_at: new Date().toISOString() })
            .eq("email", email);
          portalUser = { ...portalUser, supabase_uid: authData.user.id };
        }
      }

      if (!portalUser) {
        res.status(403).json({ error: "No portal account found for this email. Contact your KynLi advisor." });
        return;
      }

      // Create session cookie
      const sessionToken = await createPortalSessionToken(portalUser);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          id: portalUser.id,
          email: portalUser.email,
          name: portalUser.name,
          role: portalUser.role,
          tenant_slug: portalUser.tenant_slug,
          must_reset_password: portalUser.must_reset_password,
        },
      });
    } catch (err) {
      console.error("[Auth] Login error:", err);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const user = await getPortalUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenant_slug: user.tenant_slug,
      must_reset_password: user.must_reset_password,
    });
  });

  // POST /api/auth/change-password
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    const user = await getPortalUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    try {
      if (!user.supabase_uid) {
        res.status(400).json({ error: "Account not linked to auth provider" });
        return;
      }

      const { error } = await supabase.auth.admin.updateUserById(user.supabase_uid, {
        password: newPassword,
      });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      // Clear must_reset_password flag
      await supabase
        .from("portal_users")
        .update({ must_reset_password: false, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      res.json({ success: true });
    } catch (err) {
      console.error("[Auth] Change password error:", err);
      res.status(500).json({ error: "Password change failed" });
    }
  });
}
