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

function makeCtx(user: any) {
  return {
    user,
    req: { headers: {}, cookies: {} },
    res: {},
    viewAsClientTenantSlug: null,
    clientWorkspaceTenantSlug: null,
  };
}

describe("coaching client meeting routes", () => {
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

    vi.spyOn(supabaseModule, "getTenantBySlug").mockResolvedValue({
      slug: "acme_llc",
      package_tier: "cfo",
      is_active: true,
      is_churned: false,
      company_name: "Acme LLC",
    } as any);

    vi.spyOn(supabaseModule, "insertActivityLog").mockResolvedValue(undefined as any);
    vi.spyOn(supabaseModule, "listClientMeetingActionItems").mockResolvedValue([] as any);
  });

  it("lists meetings in client_meeting mode by default", async () => {
    const user = makeUser({ id: 9101, role: "admin", email: "admin@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const listSpy = vi.spyOn(supabaseModule, "listClientMeetings").mockResolvedValue([] as any);

    await caller.coaching.meetingsList({ tenantSlug: "acme_llc" });

    expect(listSpy).toHaveBeenCalledWith("acme_llc", "client_meeting");
  });

  it("creates client meetings with canonical client_meeting mode", async () => {
    const user = makeUser({ id: 9102, role: "admin", email: "admin2@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const createSpy = vi.spyOn(supabaseModule, "insertClientMeeting").mockImplementation(async (input: any) => ({
      id: 777,
      tenant_slug: input.tenant_slug,
      meeting_mode: input.meeting_mode,
      title: input.title,
      meeting_date: input.meeting_date,
      meeting_type: input.meeting_type ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "completed",
      created_by_user_id: input.created_by_user_id ?? null,
      updated_by_user_id: input.updated_by_user_id ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any));

    const res = await caller.coaching.meetingsCreate({
      tenantSlug: "acme_llc",
      title: "Q3 Client Meeting",
      meetingDate: "2026-08-20",
      meetingType: "monthly_cfo",
      notes: "Review goals",
      status: "scheduled",
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0]?.[0]).toMatchObject({
      tenant_slug: "acme_llc",
      meeting_mode: "client_meeting",
      title: "Q3 Client Meeting",
    });
    expect(res).toMatchObject({ success: true, meeting: { id: 777, meeting_mode: "client_meeting" } });
  });

  it("updates action-item status for a valid meeting and blocks unassigned staff tenant access", async () => {
    const admin = makeUser({ id: 9103, role: "admin", email: "admin3@acme.com" });
    const adminCaller = appRouter.createCaller(makeCtx(admin));

    const actionItemId = 888;
    const meetingId = 333;

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "client_meeting_action_items") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: actionItemId, meeting_id: meetingId }, error: null }),
            }),
          }),
        }),
      } as any;
    });

    vi.spyOn(supabaseModule, "getClientMeetingById").mockResolvedValue({
      id: meetingId,
      tenant_slug: "acme_llc",
      meeting_mode: "client_meeting",
      title: "Client Meeting",
      meeting_date: "2026-08-20",
      meeting_type: "other",
      notes: null,
      status: "scheduled",
      created_by_user_id: 9103,
      updated_by_user_id: 9103,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const updateStatusSpy = vi
      .spyOn(supabaseModule, "updateClientMeetingActionItemStatus")
      .mockResolvedValue({
        id: actionItemId,
        meeting_id: meetingId,
        tenant_slug: "acme_llc",
        title: "Follow up",
        details: null,
        status: "completed",
        due_date: null,
        assigned_to_user_id: null,
        completed_at: new Date().toISOString(),
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

    await expect(
      adminCaller.coaching.meetingActionItemsUpdateStatus({
        id: actionItemId,
        status: "completed",
        tenantSlug: "acme_llc",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(updateStatusSpy).toHaveBeenCalledTimes(1);

    const staff = makeUser({ id: 9104, role: "accountant", email: "staff@acme.com" });
    const staffCaller = appRouter.createCaller(makeCtx(staff));

    vi.spyOn(supabaseModule, "getStaffAssignments").mockResolvedValue([
      { staff_user_id: 9104, tenant_slug: "beta_llc" },
    ] as any);

    await expect(
      staffCaller.coaching.meetingsList({ tenantSlug: "acme_llc" }),
    ).rejects.toThrow("Tenant is not assigned to this staff member.");
  });
});
