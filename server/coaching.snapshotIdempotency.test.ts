import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let supabaseModule: any;

describe("cfo trigger snapshot idempotency helper", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    supabaseModule = await import("./supabase");
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates existing snapshot when source_import_id identity matches", async () => {
    const selectMaybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "existing-1" }, error: null })
      .mockResolvedValue({ data: null, error: null });

    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "existing-1" }, error: null });

    const fromSpy = vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "cfo_trigger_snapshots") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: selectMaybeSingle,
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({ single: updateSingle }),
          }),
        }),
        insert: () => ({
          select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "new-1" }, error: null }) }),
        }),
      } as any;
    });

    const out = await supabaseModule.upsertCfoTriggerSnapshot({
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 6,
      trigger_engine_version: "phase_5_v1",
      source_import_id: "11111111-1111-4111-8111-111111111111",
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: [],
      clear_keys: [],
      unknown_keys: [],
      triggers: [],
      raw_payload: {},
    });

    expect(out.id).toBe("existing-1");
    expect(fromSpy).toHaveBeenCalledWith("cfo_trigger_snapshots");
  });

  it("inserts when no existing snapshot found in fallback identity", async () => {
    const selectMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: "new-2" }, error: null });

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "cfo_trigger_snapshots") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({ maybeSingle: selectMaybeSingle }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          }),
        }),
        insert: () => ({
          select: () => ({ single: insertSingle }),
        }),
      } as any;
    });

    const out = await supabaseModule.upsertCfoTriggerSnapshot({
      tenant_slug: "acme_llc",
      period_year: 2026,
      period_month: 6,
      trigger_engine_version: "phase_5_v1",
      snapshot_source: "financial_pdf",
      metrics_used: {},
      trigger_summary: {},
      triggered_keys: [],
      clear_keys: [],
      unknown_keys: [],
      triggers: [],
      raw_payload: {},
    });

    expect(out.id).toBe("new-2");
  });
});
