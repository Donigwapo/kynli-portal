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
import {
  supabase,
  getPortalUserByUid,
  getPortalUserByEmail,
  markInviteAccepted,
  getStaffAssignments,
  sanitizeTenantSlug,
  type PortalUser,
  type PortalTenant,
} from "./supabase";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-change-me");
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const VIEW_AS_CLIENT_COOKIE = "portal_view_as_tenant";

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
  async function resolvePortalUserFromAuthUser(authUser: {
    id: string;
    email?: string | null;
  }): Promise<PortalUser | null> {
    let portalUser = await getPortalUserByUid(authUser.id);
    if (portalUser) {
      console.info("[Auth] portal user found by supabase_uid", { uid: authUser.id, email: portalUser.email });
      return portalUser;
    }

    const email = (authUser.email ?? "").trim().toLowerCase();

    if (email) {
      console.info("[Auth] searching portal_users by email", { email });
      portalUser = await getPortalUserByEmail(email);

      if (portalUser) {
        console.info("[Auth] portal_users match found", {
          email,
          tenant_slug: portalUser.tenant_slug,
          hadSupabaseUid: Boolean(portalUser.supabase_uid),
        });

        if (!portalUser.supabase_uid) {
          await supabase
            .from("portal_users")
            .update({ supabase_uid: authUser.id, updated_at: new Date().toISOString() })
            .eq("email", email);

          portalUser = { ...portalUser, supabase_uid: authUser.id };
          console.info("[Auth] linked supabase_uid to existing portal_user", { email, uid: authUser.id });
        }

        return portalUser;
      }

      console.info("[Auth] no portal_users match; searching portal_tenants by email", { email });
      const { data: tenantByEmail } = await supabase
        .from("portal_tenants")
        .select("slug, company_name, contact_name, email")
        .ilike("email", email)
        .maybeSingle();

      let matchedTenant: Pick<PortalTenant, "slug" | "company_name" | "contact_name" | "email"> | null =
        (tenantByEmail as Pick<PortalTenant, "slug" | "company_name" | "contact_name" | "email"> | null) ?? null;

      if (!matchedTenant) {
        console.info("[Auth] no portal_tenants.email match; searching portal_tenants by contact_name", { email });
        const { data: tenantByContactEmail, error: contactLookupError } = await supabase
          .from("portal_tenants")
          .select("slug, company_name, contact_name, email")
          .ilike("contact_name", email)
          .maybeSingle();

        if (contactLookupError) {
          console.warn("[Auth] portal_tenants contact_name lookup failed", { email, error: contactLookupError.message });
        }

        matchedTenant =
          (tenantByContactEmail as Pick<PortalTenant, "slug" | "company_name" | "contact_name" | "email"> | null) ??
          null;
      }

      if (matchedTenant) {
        console.info("[Auth] matched tenant record for callback-session", {
          searchedTable: "portal_tenants",
          email,
          slug: matchedTenant.slug,
        });

        const { data: createdPortalUser, error: createError } = await supabase
          .from("portal_users")
          .upsert(
            {
              supabase_uid: authUser.id,
              email,
              name: matchedTenant.contact_name ?? matchedTenant.company_name,
              role: "client",
              tenant_slug: matchedTenant.slug,
              must_reset_password: false,
              invite_accepted: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "email" },
          )
          .select("*")
          .single();

        if (createError) {
          console.error("[Auth] failed to create/link portal_user from tenant match", {
            email,
            slug: matchedTenant.slug,
            error: createError.message,
          });
          return null;
        }

        console.info("[Auth] created/linked portal_user from tenant match", {
          email,
          slug: matchedTenant.slug,
          uid: authUser.id,
        });

        return createdPortalUser as PortalUser;
      }

      console.warn("[Auth] no portal account match found across searched tables", {
        email,
        searchedTables: ["portal_users", "portal_tenants.email", "portal_tenants.contact_name"],
      });
    }

    return null;
  }

  async function issueSessionCookie(req: Request, res: Response, portalUser: PortalUser) {
    const sessionToken = await createPortalSessionToken(portalUser);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
  }

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

      const portalUser = await resolvePortalUserFromAuthUser(authData.user);

      await markInviteAccepted(email).catch((err) => {
        console.warn("[Auth] Failed to mark invite accepted during login:", err);
      });

      if (!portalUser) {
        res.status(403).json({ error: "No portal account found for this email. Contact your KynLi advisor." });
        return;
      }

      await issueSessionCookie(req, res, portalUser);

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
    res.clearCookie(VIEW_AS_CLIENT_COOKIE, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/auth/callback-session
  // Used by Supabase invite/magic-link callback on frontend to mint app JWT cookie.
  app.post("/api/auth/callback-session", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      res.status(400).json({ error: "Missing Supabase access token" });
      return;
    }

    try {
      const {
        data: { user: authUser },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !authUser) {
        res.status(401).json({ error: "Invalid Supabase session token" });
        return;
      }

      const portalUser = await resolvePortalUserFromAuthUser(authUser);

      const email = authUser.email ?? "";
      if (email) {
        await markInviteAccepted(email).catch((err) => {
          console.warn("[Auth] Failed to mark invite accepted during callback:", err);
        });
      }

      if (!portalUser) {
        res.status(403).json({ error: "No portal account found for this email." });
        return;
      }

      await issueSessionCookie(req, res, portalUser);

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
      console.error("[Auth] Callback session error:", err);
      res.status(500).json({ error: "Failed to establish session" });
    }
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

  // POST /api/auth/view-as-client/start
  app.post("/api/auth/view-as-client/start", async (req: Request, res: Response) => {
    const user = await getPortalUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!(user.role === "admin" || user.role === "accounting_manager" || user.role === "tax_manager" || user.role === "accountant")) {
      res.status(403).json({ error: "View as Client is restricted to staff." });
      return;
    }

    const tenantSlugRaw = (req.body?.tenantSlug as string | undefined) ?? "";
    const tenantSlug = sanitizeTenantSlug(tenantSlugRaw);
    if (!tenantSlug) {
      res.status(400).json({ error: "tenantSlug is required" });
      return;
    }

    if (user.role === "admin") {
      const { data: tenant, error } = await supabase
        .from("portal_tenants")
        .select("slug")
        .eq("slug", tenantSlug)
        .maybeSingle();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
    } else {
      const assignments = await getStaffAssignments(user.id);
      const assigned = assignments.some((a) => sanitizeTenantSlug(a.tenant_slug) === tenantSlug);
      if (!assigned) {
        res.status(403).json({ error: "Tenant is not assigned to this staff member." });
        return;
      }
    }

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(VIEW_AS_CLIENT_COOKIE, tenantSlug, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true, tenantSlug });
  });

  // POST /api/auth/view-as-client/stop
  app.post("/api/auth/view-as-client/stop", async (req: Request, res: Response) => {
    const user = await getPortalUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(VIEW_AS_CLIENT_COOKIE, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/auth/view-as-client/current
  app.get("/api/auth/view-as-client/current", async (req: Request, res: Response) => {
    const user = await getPortalUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const tenantSlug = sanitizeTenantSlug((req.cookies?.[VIEW_AS_CLIENT_COOKIE] as string | undefined) ?? "");
    res.json({ tenantSlug: tenantSlug || null });
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
