import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let appRouter: any;
let supabaseModule: any;

type DmSummary = {
  dmKey: string;
  tenantSlug: string;
  tenantName: string | null;
  peerUserId: number;
  peerDisplayName: string;
  peerRole: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
};

function makeUser(partial: { id: number; role: string; email: string; tenant_slug?: string; name?: string }) {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    supabase_uid: `uid-${partial.id}`,
    email: partial.email,
    name: partial.name ?? partial.email,
    role: partial.role,
    tenant_slug: partial.tenant_slug ?? "acme_llc",
    must_reset_password: false,
    created_at: now,
    updated_at: now,
  };
}

function makeCtx(user: any) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: null,
    clientWorkspaceTenantSlug: null,
  };
}

describe("chat.dmConversations", () => {
  const dmAdminToClient: DmSummary = {
    dmKey: "dm:u1:u2",
    tenantSlug: "acme_llc",
    tenantName: "Acme LLC",
    peerUserId: 1,
    peerDisplayName: "Ada Admin",
    peerRole: "admin",
    lastMessage: "Hi from admin",
    lastMessageAt: "2026-06-01T12:00:00.000Z",
    unreadCount: 1,
  };

  const dmAccountantToClient: DmSummary = {
    dmKey: "dm:u2:u3",
    tenantSlug: "acme_llc",
    tenantName: "Acme LLC",
    peerUserId: 3,
    peerDisplayName: "Alex Accountant",
    peerRole: "accountant",
    lastMessage: "Need your docs",
    lastMessageAt: "2026-06-02T12:00:00.000Z",
    unreadCount: 2,
  };

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
    const routersModule = await import("./routers");
    appRouter = routersModule.appRouter;
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(supabaseModule, "listClientWorkspaceAccessByUserId").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 42, staff_id: 3, tenant_slug: "acme_llc", assigned_at: "2026-01-01T00:00:00.000Z" },
    ] as any);

    vi.spyOn(supabaseModule, "listDmConversationsForUser").mockImplementation(async ({ userId, tenantSlug }: any) => {
      const slug = String(tenantSlug || "");
      if (slug && slug !== "acme_llc") return [];

      if (Number(userId) === 2) {
        return [dmAccountantToClient, dmAdminToClient];
      }

      if (Number(userId) === 3) {
        return [
          {
            ...dmAccountantToClient,
            peerUserId: 2,
            peerDisplayName: "Casey Client",
            peerRole: "client",
          },
        ];
      }

      return [];
    });
  });

  it("Admin sends DM to Client -> client dmConversations includes that DM with correct admin peer metadata", async () => {
    const client = makeUser({ id: 2, role: "client", email: "client@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(client));

    const rows = await caller.chat.dmConversations({ tenantSlug: "acme_llc" });

    const adminDm = rows.find((r: any) => r.dmKey === "dm:u1:u2");
    expect(adminDm).toBeTruthy();
    expect(adminDm).toMatchObject({
      dmKey: "dm:u1:u2",
      tenantSlug: "acme_llc",
      tenantName: "Acme LLC",
      peerUserId: 1,
      peerDisplayName: "Ada Admin",
      peerRole: "admin",
    });
  });

  it("Accountant -> Client DM discovery still works", async () => {
    const client = makeUser({ id: 2, role: "client", email: "client@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(client));

    const rows = await caller.chat.dmConversations({ tenantSlug: "acme_llc" });

    const accountantDm = rows.find((r: any) => r.dmKey === "dm:u2:u3");
    expect(accountantDm).toBeTruthy();
    expect(accountantDm).toMatchObject({
      dmKey: "dm:u2:u3",
      peerUserId: 3,
      peerDisplayName: "Alex Accountant",
      peerRole: "accountant",
    });
  });

  it("A non-participant user does not see the DM", async () => {
    const outsider = makeUser({ id: 4, role: "client", email: "outsider@acme.com", tenant_slug: "acme_llc" });
    const caller = appRouter.createCaller(makeCtx(outsider));

    const rows = await caller.chat.dmConversations({ tenantSlug: "acme_llc" });

    expect(rows).toEqual([]);
  });
});
