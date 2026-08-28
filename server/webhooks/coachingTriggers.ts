import type { Request, Response } from "express";
import { z } from "zod";
import { FINANCIAL_TRIGGER_KEYS } from "../../shared/coachingTriggers";
import { supabase, sanitizeTenantSlug, upsertCfoTriggerSnapshot } from "../supabase";

const FINANCIAL_TRIGGER_KEY_SET: ReadonlySet<string> = new Set(FINANCIAL_TRIGGER_KEYS);

const financialTriggerKeySchema = z.string().refine(
  (value) => FINANCIAL_TRIGGER_KEY_SET.has(value as any),
  "Unsupported financial trigger key",
);
const triggerStatusSchema = z.enum(["triggered", "clear", "unknown"]);

const webhookTriggerSchema = z.object({
  trigger_key: financialTriggerKeySchema,
  status: triggerStatusSchema,
  actual_value: z.union([z.number(), z.null()]).optional().nullable(),
  threshold_value: z.union([z.number(), z.null()]).optional().nullable(),
  display_value: z.union([z.string(), z.number(), z.null()]).optional().nullable(),
  reason: z.union([z.string(), z.null()]).optional().nullable(),
  source_report: z.union([z.string(), z.null()]).optional().nullable(),
  source_field: z.union([z.string(), z.null()]).optional().nullable(),
  evidence: z.unknown().optional(),
}).passthrough();

const webhookPayloadSchema = z.object({
  tenant_slug: z.string().min(1),
  period_year: z.number().int().min(1000).max(9999),
  period_month: z.number().int().min(1).max(12),
  report_month_label: z.string().optional(),
  trigger_engine_version: z.string().min(1),
  source_import_id: z.string().uuid().optional(),
  source_document_id: z.string().uuid().optional(),
  snapshot_source: z.literal("financial_pdf").optional(),
  metrics_used: z.record(z.string(), z.unknown()).optional(),
  trigger_summary: z.record(z.string(), z.unknown()).optional(),
  triggered_keys: z.array(financialTriggerKeySchema).optional(),
  clear_keys: z.array(financialTriggerKeySchema).optional(),
  unknown_keys: z.array(financialTriggerKeySchema).optional(),
  triggers: z.array(webhookTriggerSchema),
  generated_at: z.string().optional(),
}).passthrough();

const LOG_PREFIX = "[CoachingTriggersWebhook]";

function formatZodIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

function formatError(err: unknown): { message: string; code?: string; details?: string } {
  if (err && typeof err === "object") {
    const anyErr = err as any;
    return {
      message: String(anyErr.message || "Unknown error"),
      code: typeof anyErr.code === "string" ? anyErr.code : undefined,
      details: typeof anyErr.details === "string" ? anyErr.details : undefined,
    };
  }
  return { message: String(err || "Unknown error") };
}

export async function handleCoachingTriggersWebhook(req: Request, res: Response): Promise<void> {
  const secretHeader = String(req.header("X-Kynli-Webhook-Secret") || "").trim();
  const expectedSecret = String(process.env.N8N_COACHING_TRIGGERS_WEBHOOK_SECRET || "").trim();

  if (!expectedSecret || !secretHeader || secretHeader !== expectedSecret) {
    console.warn(`${LOG_PREFIX} Unauthorized`);
    res.status(401).json({ received: false });
    return;
  }

  if (!req.is("application/json")) {
    console.warn(`${LOG_PREFIX} Invalid content type`, {
      contentType: req.header("content-type") || null,
    });
    res.status(400).json({ received: false });
    return;
  }

  const parsed = webhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn(`${LOG_PREFIX} Invalid payload`, {
      issues: formatZodIssues(parsed.error.issues),
    });
    res.status(400).json({ received: false });
    return;
  }

  const body = parsed.data;
  const unsupportedTrigger = body.triggers.find((t) => !FINANCIAL_TRIGGER_KEY_SET.has(String(t.trigger_key)));
  if (unsupportedTrigger) {
    console.warn(`${LOG_PREFIX} Invalid payload`, {
      reason: "unsupported_trigger_key",
      triggerKey: String(unsupportedTrigger.trigger_key || ""),
    });
    res.status(400).json({ received: false });
    return;
  }
  const tenantSlug = sanitizeTenantSlug(body.tenant_slug);

  const payloadKeys = new Set(body.triggers.map((t) => t.trigger_key));
  const invalidSummaryKey = [
    ...(body.triggered_keys || []),
    ...(body.clear_keys || []),
    ...(body.unknown_keys || []),
  ].find((key) => !payloadKeys.has(key));

  if (invalidSummaryKey) {
    console.warn(`${LOG_PREFIX} Invalid payload`, {
      reason: "summary_key_not_present_in_triggers",
      triggerKey: String(invalidSummaryKey),
    });
    res.status(400).json({ received: false });
    return;
  }

  const duplicateKeys = body.triggers.map((t) => t.trigger_key);
  if (new Set(duplicateKeys).size !== duplicateKeys.length) {
    console.warn(`${LOG_PREFIX} Invalid payload`, {
      reason: "duplicate_trigger_keys",
    });
    res.status(400).json({ received: false });
    return;
  }

  if (body.source_import_id) {
    const { data: job, error } = await supabase
      .from("financial_import_jobs")
      .select("import_id, tenant_slug, month, year")
      .eq("import_id", body.source_import_id)
      .maybeSingle();

    if (error) {
      const formatted = formatError(error);
      console.warn(`${LOG_PREFIX} Import validation failed`, {
        reason: "import_lookup_error",
        importId: body.source_import_id,
        errorMessage: formatted.message,
        errorCode: formatted.code,
      });
      res.status(400).json({ received: false });
      return;
    }

    if (!job) {
      console.warn(`${LOG_PREFIX} Import validation failed`, {
        reason: "import_not_found",
        importId: body.source_import_id,
      });
      res.status(400).json({ received: false });
      return;
    }

    const jobTenantSlug = sanitizeTenantSlug(String((job as any).tenant_slug || ""));
    const jobMonth = Number((job as any).month || 0);
    const jobYear = Number((job as any).year || 0);

    if (jobTenantSlug !== tenantSlug) {
      console.warn(`${LOG_PREFIX} Import validation failed`, {
        reason: "tenant_mismatch",
        importId: body.source_import_id,
        expectedTenantSlug: tenantSlug,
        actualTenantSlug: jobTenantSlug,
      });
      res.status(400).json({ received: false });
      return;
    }

    if (jobYear !== body.period_year) {
      console.warn(`${LOG_PREFIX} Import validation failed`, {
        reason: "period_year_mismatch",
        importId: body.source_import_id,
        expectedPeriodYear: body.period_year,
        actualPeriodYear: jobYear,
      });
      res.status(400).json({ received: false });
      return;
    }

    if (jobMonth !== body.period_month) {
      console.warn(`${LOG_PREFIX} Import validation failed`, {
        reason: "period_month_mismatch",
        importId: body.source_import_id,
        expectedPeriodMonth: body.period_month,
        actualPeriodMonth: jobMonth,
      });
      res.status(400).json({ received: false });
      return;
    }
  }

  try {
    await upsertCfoTriggerSnapshot({
    tenant_slug: tenantSlug,
    period_year: body.period_year,
    period_month: body.period_month,
    report_month_label: body.report_month_label ?? null,
    trigger_engine_version: body.trigger_engine_version,
    source_import_id: body.source_import_id ?? null,
    source_document_id: body.source_document_id ?? null,
    snapshot_source: "financial_pdf",
    metrics_used: body.metrics_used ?? {},
    trigger_summary: body.trigger_summary ?? {},
    triggered_keys: body.triggered_keys ?? [],
    clear_keys: body.clear_keys ?? [],
    unknown_keys: body.unknown_keys ?? [],
    triggers: body.triggers.map((t) => ({
      ...t,
      status: t.status,
      trigger_key: t.trigger_key,
    })),
    raw_payload: req.body as Record<string, unknown>,
    received_at: new Date().toISOString(),
    });
  } catch (error) {
    const formatted = formatError(error);
    console.error(`${LOG_PREFIX} Persistence failed`, {
      errorMessage: formatted.message,
      errorCode: formatted.code,
      errorDetails: formatted.details,
    });
    res.status(400).json({ received: false });
    return;
  }

  res.status(200).json({ received: true });
}

export const coachingTriggersWebhookPayloadSchema = webhookPayloadSchema;
