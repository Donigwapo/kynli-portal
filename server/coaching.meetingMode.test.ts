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

describe("coaching meeting mode separation", () => {
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
  });

  it("separates check_in_call and client_meeting records in list/create under same tenant", async () => {
    const user = makeUser({ id: 9001, role: "admin", email: "admin@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const meetings: any[] = [
      {
        id: 1,
        tenant_slug: "acme_llc",
        meeting_mode: "client_meeting",
        title: "Quarterly Review",
        meeting_date: "2026-06-01",
        meeting_type: "quarterly_review",
        notes: null,
        status: "completed",
        created_by_user_id: 9001,
        updated_by_user_id: 9001,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 2,
        tenant_slug: "acme_llc",
        meeting_mode: "check_in_call",
        title: "Weekly Check-in",
        meeting_date: "2026-06-02",
        meeting_type: "other",
        notes: null,
        status: "completed",
        created_by_user_id: 9001,
        updated_by_user_id: 9001,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(supabaseModule, "listClientMeetings").mockImplementation(async (tenantSlug: string, mode?: string) => {
      return meetings.filter(
        (m) => m.tenant_slug === tenantSlug && (!mode || m.meeting_mode === mode),
      );
    });
    vi.spyOn(supabaseModule, "listClientMeetingActionItems").mockResolvedValue([] as any);

    vi.spyOn(supabaseModule, "insertClientMeeting").mockImplementation(async (input: any) => {
      const row = {
        id: meetings.length + 1,
        tenant_slug: input.tenant_slug,
        meeting_mode: input.meeting_mode ?? "client_meeting",
        title: input.title,
        meeting_date: input.meeting_date,
        meeting_type: input.meeting_type ?? null,
        notes: input.notes ?? null,
        status: input.status ?? "completed",
        created_by_user_id: input.created_by_user_id ?? null,
        updated_by_user_id: input.updated_by_user_id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      meetings.push(row);
      return row as any;
    });

    const listClientMeetingBefore = await caller.coaching.meetingsList({ tenantSlug: "acme_llc", mode: "client_meeting" });
    const listCheckInBefore = await caller.coaching.meetingsList({ tenantSlug: "acme_llc", mode: "check_in_call" });

    expect(listClientMeetingBefore.map((m: any) => m.id)).toEqual([1]);
    expect(listCheckInBefore.map((m: any) => m.id)).toEqual([2]);

    const createdCheckIn = await caller.coaching.meetingsCreate({
      tenantSlug: "acme_llc",
      mode: "check_in_call",
      title: "Call A",
      meetingDate: "2026-06-10",
      meetingType: "other",
      notes: null,
      status: "scheduled",
    });

    const createdClientMeeting = await caller.coaching.meetingsCreate({
      tenantSlug: "acme_llc",
      mode: "client_meeting",
      title: "Meeting B",
      meetingDate: "2026-06-11",
      meetingType: "monthly_cfo",
      notes: null,
      status: "scheduled",
    });

    const listClientMeetingAfter = await caller.coaching.meetingsList({ tenantSlug: "acme_llc", mode: "client_meeting" });
    const listCheckInAfter = await caller.coaching.meetingsList({ tenantSlug: "acme_llc", mode: "check_in_call" });

    expect(listClientMeetingAfter.some((m: any) => m.id === createdCheckIn.meeting.id)).toBe(false);
    expect(listCheckInAfter.some((m: any) => m.id === createdClientMeeting.meeting.id)).toBe(false);

    expect(listClientMeetingAfter.every((m: any) => m.meeting_mode === "client_meeting")).toBe(true);
    expect(listCheckInAfter.every((m: any) => m.meeting_mode === "check_in_call")).toBe(true);
  });

  it("prevents cross-mode action item status updates", async () => {
    const user = makeUser({ id: 9002, role: "admin", email: "admin2@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const actionItemId = 555;
    const checkInMeetingId = 202;

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "client_meeting_action_items") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: actionItemId, meeting_id: checkInMeetingId }, error: null }),
            }),
          }),
        }),
      } as any;
    });

    vi.spyOn(supabaseModule, "getClientMeetingById").mockImplementation(async (_slug: string, meetingId: number, mode?: string) => {
      if (meetingId !== checkInMeetingId) return null;
      if (mode === "check_in_call") {
        return {
          id: checkInMeetingId,
          tenant_slug: "acme_llc",
          meeting_mode: "check_in_call",
          title: "Check-in",
          meeting_date: "2026-06-20",
          meeting_type: "other",
          notes: null,
          status: "scheduled",
          created_by_user_id: 9002,
          updated_by_user_id: 9002,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any;
      }
      return null;
    });

    const updateStatusSpy = vi
      .spyOn(supabaseModule, "updateClientMeetingActionItemStatus")
      .mockResolvedValue({
        id: actionItemId,
        meeting_id: checkInMeetingId,
        tenant_slug: "acme_llc",
        title: "Follow-up",
        details: null,
        status: "completed",
        due_date: null,
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
        mode: "client_meeting",
      }),
    ).rejects.toThrow("Action item not found");

    expect(updateStatusSpy).not.toHaveBeenCalled();

    await expect(
      caller.coaching.meetingActionItemsUpdateStatus({
        id: actionItemId,
        status: "completed",
        tenantSlug: "acme_llc",
        mode: "check_in_call",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(updateStatusSpy).toHaveBeenCalledTimes(1);
  });

  it("defaults list mode to client_meeting when mode is omitted", async () => {
    const user = makeUser({ id: 9003, role: "admin", email: "admin3@acme.com" });
    const caller = appRouter.createCaller(makeCtx(user));

    const listSpy = vi.spyOn(supabaseModule, "listClientMeetings").mockResolvedValue([] as any);
    vi.spyOn(supabaseModule, "listClientMeetingActionItems").mockResolvedValue([] as any);

    await caller.coaching.meetingsList({ tenantSlug: "acme_llc" });

    expect(listSpy).toHaveBeenCalledWith("acme_llc", "client_meeting");
  });
});
