import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let authModule: any;
let supabaseModule: any;

function makeApp() {
  return {
    routes: new Map<string, any>(),
    post(path: string, handler: any) { this.routes.set(`POST ${path}`, handler); },
    get(path: string, handler: any) { this.routes.set(`GET ${path}`, handler); },
  } as any;
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    redirectCode: null as number | null,
    redirectTarget: null as string | null,
    cookies: [] as any[],
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    send(payload: any) { this.body = payload; return this; },
    redirect(code: number, target: string) {
      this.redirectCode = code;
      this.redirectTarget = target;
      return this;
    },
    cookie(name: string, value: string, options: any) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie() { return this; },
  };
  return res;
}

describe("invite lifecycle hardening", () => {
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

  it("blocks login when invite context exists but atomic acceptance fails", async () => {
    const app = makeApp();
    authModule.registerAuthRoutes(app);

    vi.spyOn(supabaseModule.supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "uid-1", email: "client@example.com" } },
      error: null,
    } as any);

    vi.spyOn(supabaseModule, "getPortalUserByUid").mockResolvedValue(null);
    vi.spyOn(supabaseModule, "getPortalUserByEmail").mockResolvedValue({
      id: 101,
      supabase_uid: "uid-1",
      email: "client@example.com",
      name: "Client",
      role: "client",
      tenant_slug: "heynova",
      must_reset_password: false,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    vi.spyOn(supabaseModule, "getInviteByToken").mockResolvedValue({
      invite_token: "tok",
      email: "client@example.com",
      tenant_slug: "test1",
      status: "pending",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    } as any);

    vi.spyOn(supabaseModule, "acceptInviteForPortalUserAtomic").mockResolvedValue({
      applied: false,
      tenantSlug: null,
      reason: "invite_not_pending",
    });

    const req: any = {
      body: { email: "client@example.com", password: "secret" },
      headers: { "x-forwarded-proto": "https" },
      protocol: "https",
      cookies: {
        portal_invite_context: "tok|test1",
      },
    };
    const res = makeRes();

    const handler = app.routes.get("POST /api/auth/login");
    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(String(res.body?.error || "")).toContain("Invitation could not be accepted");
  });

  it("rejects invite acceptance when authenticated email does not match invite email", async () => {
    const app = makeApp();
    authModule.registerAuthRoutes(app);

    vi.spyOn(supabaseModule.supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "uid-2", email: "wrong@example.com" } },
      error: null,
    } as any);

    vi.spyOn(supabaseModule, "getPortalUserByUid").mockResolvedValue(null);
    vi.spyOn(supabaseModule, "getPortalUserByEmail").mockResolvedValue({
      id: 102,
      supabase_uid: "uid-2",
      email: "wrong@example.com",
      name: "Wrong",
      role: "client",
      tenant_slug: "heynova",
      must_reset_password: false,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const atomicSpy = vi.spyOn(supabaseModule, "acceptInviteForPortalUserAtomic");

    vi.spyOn(supabaseModule, "getInviteByToken").mockResolvedValue({
      invite_token: "tok2",
      email: "target@example.com",
      tenant_slug: "test1",
      status: "pending",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    } as any);

    const req: any = {
      body: { email: "wrong@example.com", password: "secret" },
      headers: { "x-forwarded-proto": "https" },
      protocol: "https",
      cookies: {
        portal_invite_context: "tok2|test1",
      },
    };
    const res = makeRes();

    const handler = app.routes.get("POST /api/auth/login");
    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(atomicSpy).not.toHaveBeenCalled();
  });

  it("already-authenticated /invite route returns 403 when atomic acceptance fails", async () => {
    const app = makeApp();
    authModule.registerAuthRoutes(app);

    const sessionToken = await authModule.createPortalSessionToken({
      id: 103,
      supabase_uid: "uid-3",
      email: "client3@example.com",
      name: "Client 3",
      role: "client",
      tenant_slug: "heynova",
      must_reset_password: false,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    vi.spyOn(supabaseModule, "getPortalUserByEmail").mockResolvedValue({
      id: 103,
      supabase_uid: "uid-3",
      email: "client3@example.com",
      name: "Client 3",
      role: "client",
      tenant_slug: "heynova",
      must_reset_password: false,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    vi.spyOn(supabaseModule, "getInviteByToken").mockResolvedValue({
      invite_token: "tok3",
      email: "client3@example.com",
      tenant_slug: "test1",
      status: "pending",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
      supabase_link: "https://supabase/link",
    } as any);

    vi.spyOn(supabaseModule, "acceptInviteForPortalUserAtomic").mockResolvedValue({
      applied: false,
      tenantSlug: null,
      reason: "invite_expired",
    });

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "portal_invites") throw new Error("Unexpected table");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                invite_token: "tok3",
                status: "pending",
                tenant_slug: "test1",
                expires_at: new Date(Date.now() + 60_000).toISOString(),
                revoked_at: null,
                supabase_link: "https://supabase/link",
                email: "client3@example.com",
              },
              error: null,
            }),
          }),
        }),
      } as any;
    });

    const req: any = {
      params: { inviteToken: "tok3" },
      protocol: "https",
      headers: { "x-forwarded-proto": "https" },
      cookies: { app_session_id: sessionToken },
    };
    const res = makeRes();

    const handler = app.routes.get("GET /invite/:inviteToken");
    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(String(res.body || "")).toContain("Invitation could not be accepted");
  });
});
