import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let appRouter: any;
let supabaseModule: any;

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

function makeCtx(user: any, opts?: { clientWorkspaceTenantSlug?: string | null; viewAsClientTenantSlug?: string | null }) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: opts?.viewAsClientTenantSlug ?? null,
    clientWorkspaceTenantSlug: opts?.clientWorkspaceTenantSlug ?? null,
  };
}

describe("documents.delete in view-as-client workspace", () => {
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
  });

  it("allows accountant delete in trusted view-as-client tenant context without input tenantSlug", async () => {
    const user = makeUser({ id: 201, role: "accountant", email: "acct@firm.com", tenant_slug: null as any });
    const caller = appRouter.createCaller(
      makeCtx(user, {
        viewAsClientTenantSlug: "acme_llc",
        clientWorkspaceTenantSlug: null,
      }),
    );

    const tableStub = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: "doc-1", tenant_slug: "acme_llc", uploaded_by_user_id: "777" }],
        error: null,
      }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "doc-1",
          tenant_slug: "acme_llc",
          organization_id: "org-1",
          client_id: null,
          file_name: "Clip",
          name: "clip.mp4",
          doc_type: "Other",
          file_key: "acme_llc/other/2026/06/clip.mp4",
        },
        error: null,
      }),
    } as any;

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "documents_metadata") return tableStub;
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, tenant_slug: "acme_llc", staff_id: user.id, assigned_at: new Date().toISOString() },
    ] as any);

    const deleteDoc = vi.spyOn(supabaseModule, "deleteDocument").mockResolvedValue(undefined as any);
    vi.spyOn(supabaseModule, "deleteDocumentsByUploader").mockResolvedValue({ deleted: 1 } as any);
    vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({} as any);

    const out = await caller.documents.delete({ id: "doc-1" });

    expect(out.success).toBe(true);
    expect(deleteDoc).toHaveBeenCalledWith("acme_llc", "doc-1");
  });

  it("blocks accountant delete for different tenant while viewing another client", async () => {
    const user = makeUser({ id: 202, role: "accountant", email: "acct2@firm.com", tenant_slug: null as any });
    const caller = appRouter.createCaller(
      makeCtx(user, {
        viewAsClientTenantSlug: "acme_llc",
        clientWorkspaceTenantSlug: null,
      }),
    );

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table === "documents_metadata") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: "doc-2", tenant_slug: "other_llc", uploaded_by_user_id: "777" }],
            error: null,
          }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      }
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    });

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { id: 1, tenant_slug: "acme_llc", staff_id: user.id, assigned_at: new Date().toISOString() },
      { id: 2, tenant_slug: "other_llc", staff_id: user.id, assigned_at: new Date().toISOString() },
    ] as any);

    await expect(caller.documents.delete({ id: "doc-2" })).rejects.toThrow(
      "You can only delete documents from your own tenant.",
    );
  });
});
