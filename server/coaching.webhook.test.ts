import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let webhookModule: any;
let supabaseModule: any;

function makeReq(body: any, secret?: string, contentType = "application/json") {
  return {
    body,
    header: (name: string) => (name.toLowerCase() === "x-kynli-webhook-secret" ? secret : undefined),
    is: (type: string) => contentType === type,
  } as any;
}

function makeRes() {
  const out: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res = {
    status: (code: number) => {
      out.statusCode = code;
      return {
        json: (payload: any) => {
          out.body = payload;
          return res;
        },
      };
    },
    json: (payload: any) => {
      out.body = payload;
      return res;
    },
    get headersSent() {
      return false;
    },
  } as any;
  return { res, out };
}

const validPayload = {
  tenant_slug: "acme_llc",
  period_year: 2026,
  period_month: 6,
  report_month_label: "Jun 26",
  trigger_engine_version: "phase_5_v1",
  source_import_id: "11111111-1111-4111-8111-111111111111",
  metrics_used: {},
  trigger_summary: { total: 14, triggered: 1, clear: 13, unknown: 0 },
  triggered_keys: ["negative_net_income"],
  clear_keys: [],
  unknown_keys: [],
  triggers: [
    {
      trigger_key: "negative_net_income",
      status: "triggered",
      actual_value: -100,
      threshold_value: 0,
      display_value: "$-100",
      reason: "Negative",
      source_report: "P&L",
      source_field: "net_income",
      evidence: {},
    },
  ],
};

describe("coaching triggers webhook", () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

    webhookModule = await import("./webhooks/coachingTriggers");
    supabaseModule = await import("./supabase");
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.N8N_COACHING_TRIGGERS_WEBHOOK_SECRET = "test-secret";
  });

  it("rejects bad secret", async () => {
    const { res, out } = makeRes();
    const req = makeReq(validPayload, "wrong-secret");

    await webhookModule.handleCoachingTriggersWebhook(req, res);

    expect(out.statusCode).toBe(401);
    expect(out.body).toEqual({ received: false });
  });

  it("rejects invalid period month", async () => {
    const { res, out } = makeRes();
    const req = makeReq({ ...validPayload, period_month: 13 }, "test-secret");

    await webhookModule.handleCoachingTriggersWebhook(req, res);

    expect(out.statusCode).toBe(400);
    expect(out.body).toEqual({ received: false });
  });

  it("rejects source_import_id tenant/period mismatch", async () => {
    const { res, out } = makeRes();
    const req = makeReq(validPayload, "test-secret");

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "financial_import_jobs") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                import_id: validPayload.source_import_id,
                tenant_slug: "other_llc",
                month: 7,
                year: 2025,
              },
              error: null,
            }),
          }),
        }),
      } as any;
    });

    const upsertSpy = vi.spyOn(supabaseModule, "upsertCfoTriggerSnapshot").mockResolvedValue({} as any);

    await webhookModule.handleCoachingTriggersWebhook(req, res);

    expect(out.statusCode).toBe(400);
    expect(out.body).toEqual({ received: false });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("accepts valid payload", async () => {
    const { res, out } = makeRes();
    const req = makeReq(validPayload, "test-secret");

    vi.spyOn(supabaseModule.supabase, "from").mockImplementation((table: string) => {
      if (table !== "financial_import_jobs") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                import_id: validPayload.source_import_id,
                tenant_slug: validPayload.tenant_slug,
                month: validPayload.period_month,
                year: validPayload.period_year,
              },
              error: null,
            }),
          }),
        }),
      } as any;
    });

    const upsertSpy = vi.spyOn(supabaseModule, "upsertCfoTriggerSnapshot").mockResolvedValue({ id: "1" } as any);

    await webhookModule.handleCoachingTriggersWebhook(req, res);

    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual({ received: true });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported financial trigger key", async () => {
    const { res, out } = makeRes();
    const req = makeReq({
      ...validPayload,
      triggers: [{ ...validPayload.triggers[0], trigger_key: "not_a_real_key" }],
      triggered_keys: ["not_a_real_key"],
    }, "test-secret");

    await webhookModule.handleCoachingTriggersWebhook(req, res);

    expect(out.statusCode).toBe(400);
    expect(out.body).toEqual({ received: false });
  });
});
