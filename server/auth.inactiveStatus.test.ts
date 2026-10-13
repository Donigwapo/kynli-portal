import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let authModule: any;
let supabaseModule: any;

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    cookies: [] as any[],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    cookie(name: string, value: string, options: any) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie() {
      return this;
    },
  };
  return res;
}

describe("auth inactive user protections", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
    authModule = await import("./auth");
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getPortalUserFromRequest returns null for inactive users", async () => {
    const token = await authModule.createPortalSessionToken({
      id: 10,
      supabase_uid: "uid-10",
      email: "inactive@firm.com",
      name: "Inactive",
      role: "accountant",
      tenant_slug: null,
      must_reset_password: false,
      status: "inactive",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(supabaseModule, "getPortalUserByEmail").mockResolvedValue({
      id: 10,
      supabase_uid: "uid-10",
      email: "inactive@firm.com",
      name: "Inactive",
      role: "accountant",
      tenant_slug: null,
      must_reset_password: false,
      status: "inactive",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const req: any = { cookies: { portal_auth: token } };
    const out = await authModule.getPortalUserFromRequest(req);
    expect(out).toBeNull();
  });

  it("login route rejects inactive users after successful Supabase auth", async () => {
    const app: any = {
      routes: new Map<string, any>(),
      post(path: string, handler: any) { this.routes.set(`POST ${path}`, handler); },
      get(path: string, handler: any) { this.routes.set(`GET ${path}`, handler); },
    };

    authModule.registerAuthRoutes(app);

    vi.spyOn(supabaseModule.supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "uid-inactive", email: "inactive@firm.com" } },
      error: null,
    } as any);

    vi.spyOn(supabaseModule, "getPortalUserByUid").mockResolvedValue(null);
    vi.spyOn(supabaseModule, "getPortalUserByEmail").mockResolvedValue({
      id: 20,
      supabase_uid: "uid-inactive",
      email: "inactive@firm.com",
      name: "Inactive",
      role: "accountant",
      tenant_slug: null,
      must_reset_password: false,
      status: "inactive",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    vi.spyOn(supabaseModule, "markInviteAccepted").mockResolvedValue(undefined as any);

    const handler = app.routes.get("POST /api/auth/login");
    const req: any = { body: { email: "inactive@firm.com", password: "x" }, headers: {}, cookies: {} };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(String(res.body?.error || "").toLowerCase()).toContain("inactive");
  });
});
