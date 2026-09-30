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

  it("creates standalone action item with meeting_id null", async () => {
    const admin = makeUser({ id: 9105, role: "admin", email: "admin5@acme.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    const getMeetingSpy = vi.spyOn(supabaseModule, "getClientMeetingById");
    vi.spyOn(supabaseModule, "listClientMeetingActionItems").mockResolvedValue([] as any);

    const insertSpy = vi.spyOn(supabaseModule, "insertClientMeetingActionItem").mockResolvedValue({
      id: 901,
      meeting_id: null,
      tenant_slug: "acme_llc",
      title: "Follow up with payroll",
      details: null,
      status: "open",
      due_date: null,
      assigned_to_user_id: null,
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const out = await caller.coaching.meetingActionItemsCreate({
      tenantSlug: "acme_llc",
      title: "Follow up with payroll",
      meetingId: null,
    });

    expect(out.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      tenant_slug: "acme_llc",
      meeting_id: null,
      title: "Follow up with payroll",
      status: "open",
    }));
    expect(getMeetingSpy).not.toHaveBeenCalled();
  });

  it("creates meeting-linked action item when meeting exists", async () => {
    const admin = makeUser({ id: 9106, role: "admin", email: "admin6@acme.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    vi.spyOn(supabaseModule, "getClientMeetingById").mockResolvedValue({
      id: 333,
      tenant_slug: "acme_llc",
      meeting_mode: "client_meeting",
      title: "Client Meeting",
      meeting_date: "2026-08-20",
      meeting_type: "other",
      notes: null,
      status: "scheduled",
      created_by_user_id: 9106,
      updated_by_user_id: 9106,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    vi.spyOn(supabaseModule, "listClientMeetingActionItems").mockResolvedValue([] as any);

    const insertSpy = vi.spyOn(supabaseModule, "insertClientMeetingActionItem").mockResolvedValue({
      id: 902,
      meeting_id: 333,
      tenant_slug: "acme_llc",
      title: "Prepare agenda",
      details: null,
      status: "open",
      due_date: null,
      assigned_to_user_id: null,
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    await caller.coaching.meetingActionItemsCreate({
      tenantSlug: "acme_llc",
      title: "Prepare agenda",
      meetingId: 333,
    });

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ meeting_id: 333 }));
  });

  it("blocks client role from creating action items", async () => {
    const clientUser = makeUser({ id: 9107, role: "client", email: "client@acme.com" });
    const caller = appRouter.createCaller(makeCtx(clientUser));

    await expect(
      caller.coaching.meetingActionItemsCreate({ title: "Client task", meetingId: null }),
    ).rejects.toThrow("Only staff can create action items.");
  });

  it("updates standalone action-item status without requiring meeting lookup", async () => {
    const admin = makeUser({ id: 9108, role: "admin", email: "admin8@acme.com" });
    const caller = appRouter.createCaller(makeCtx(admin));

    const actionItemId = 889;

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "client_meeting_action_items") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: actionItemId, meeting_id: null }, error: null }),
            }),
          }),
        }),
      } as any;
    });

    const getMeetingSpy = vi.spyOn(supabaseModule, "getClientMeetingById");
    const updateStatusSpy = vi
      .spyOn(supabaseModule, "updateClientMeetingActionItemStatus")
      .mockResolvedValue({
        id: actionItemId,
        meeting_id: null,
        tenant_slug: "acme_llc",
        title: "Standalone follow up",
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
      caller.coaching.meetingActionItemsUpdateStatus({
        id: actionItemId,
        status: "completed",
        tenantSlug: "acme_llc",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(updateStatusSpy).toHaveBeenCalledTimes(1);
    expect(getMeetingSpy).not.toHaveBeenCalled();
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
