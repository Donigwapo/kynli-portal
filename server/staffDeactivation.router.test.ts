import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type AnyObj = Record<string, any>;

let appRouter: any;
let supabaseModule: AnyObj;

function makeUser(partial: { id: number; role: string; email: string; status?: "active" | "inactive"; tenant_slug?: string | null }) {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    supabase_uid: `uid-${partial.id}`,
    email: partial.email,
    name: partial.email,
    role: partial.role,
    tenant_slug: partial.tenant_slug ?? null,
    must_reset_password: false,
    status: partial.status ?? "active",
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

describe("staff deactivate/reactivate router safeguards", () => {
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
    vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue({} as any);
  });

  it("blocks non-admin callers from deactivation API", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 77, role: "accountant", email: "acct@firm.com" })));
    await expect(caller.staff.deactivate({ id: 123 })).rejects.toThrow(/admin/i);
  });

  it("keeps hard delete disabled in normal staff.remove", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 1, role: "admin", email: "admin@firm.com" })));
    await expect(caller.staff.remove({ id: 123 })).rejects.toThrow(/disabled/i);
  });

  it("blocks self-deactivation", async () => {
    const admin = makeUser({ id: 10, role: "admin", email: "admin@firm.com" });
    vi.spyOn(supabaseModule, "getStaffById").mockResolvedValue(admin as any);

    const caller = appRouter.createCaller(makeCtx(admin));
    await expect(caller.staff.deactivate({ id: 10 })).rejects.toThrow(/cannot deactivate your own/i);
  });

  it("blocks deactivation of the last active admin", async () => {
    const actor = makeUser({ id: 11, role: "admin", email: "admin2@firm.com" });
    const target = makeUser({ id: 12, role: "admin", email: "admin3@firm.com" });

    vi.spyOn(supabaseModule, "getStaffById").mockResolvedValue(target as any);
    vi.spyOn(supabaseModule, "countActiveAdmins").mockResolvedValue(1);

    const caller = appRouter.createCaller(makeCtx(actor));
    await expect(caller.staff.deactivate({ id: 12 })).rejects.toThrow(/last active admin/i);
  });

  it("deactivates eligible staff and returns released assignment count", async () => {
    const actor = makeUser({ id: 20, role: "admin", email: "admin@firm.com" });
    const target = makeUser({ id: 21, role: "accountant", email: "acct@firm.com", status: "active" });

    vi.spyOn(supabaseModule, "getStaffById").mockResolvedValue(target as any);
    const deactivateSpy = vi.spyOn(supabaseModule, "deactivateStaffMember").mockResolvedValue({
      deactivation_event_id: "11111111-1111-1111-1111-111111111111",
      assignment_count: 3,
    });

    const caller = appRouter.createCaller(makeCtx(actor));
    const out = await caller.staff.deactivate({ id: 21 });

    expect(out.success).toBe(true);
    expect(out.releasedAssignmentCount).toBe(3);
    expect(deactivateSpy).toHaveBeenCalledWith(21, 20);
  });

  it("reactivation preview is only allowed for inactive users", async () => {
    const actor = makeUser({ id: 30, role: "admin", email: "admin@firm.com" });
    const target = makeUser({ id: 31, role: "accountant", email: "acct@firm.com", status: "active" });

    vi.spyOn(supabaseModule, "getStaffById").mockResolvedValue(target as any);

    const caller = appRouter.createCaller(makeCtx(actor));
    await expect(caller.staff.reactivatePreview({ id: 31 })).rejects.toThrow(/not inactive/i);
  });

  it("reactivates inactive staff and returns restore/skip counts", async () => {
    const actor = makeUser({ id: 40, role: "admin", email: "admin@firm.com" });
    const target = {
      ...makeUser({ id: 41, role: "accountant", email: "acct@firm.com", status: "inactive" }),
      last_deactivation_event_id: "22222222-2222-2222-2222-222222222222",
    };

    vi.spyOn(supabaseModule, "getStaffById").mockResolvedValue(target as any);
    vi.spyOn(supabaseModule, "reactivateStaffMember").mockResolvedValue({
      deactivation_event_id: "22222222-2222-2222-2222-222222222222",
      restored_count: 2,
      skipped_conflict_count: 1,
      skipped_ineligible_count: 0,
      skipped_missing_count: 1,
    });

    const caller = appRouter.createCaller(makeCtx(actor));
    const out = await caller.staff.reactivate({ id: 41 });

    expect(out.success).toBe(true);
    expect(out.restoredCount).toBe(2);
    expect(out.skippedConflictCount).toBe(1);
    expect(out.skippedMissingCount).toBe(1);
  });
});
