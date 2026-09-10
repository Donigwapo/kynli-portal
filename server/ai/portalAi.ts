import type { Message } from "../_core/llm";

export const PORTAL_AI_MAX_MESSAGE_LENGTH = 2000;
export const PORTAL_AI_MAX_CONTEXT_MESSAGES = 8;
export const MAX_TRIGGER_PERIODS_PER_REQUEST = 3;

export type PortalAiTriggerContext = {
  period: { year: number; month: number; key: string; label?: string | null };
  summary: { total: number; triggered: number; clear: number; unknown: number };
  triggers: Array<{
    key: string;
    label: string;
    status: "triggered" | "clear" | "unknown";
    value: string | number | null;
    reason: string | null;
  }>;
};

export type PortalAiFinancialContext = {
  period: { year: number; month: number; key: string; label: string };
  summary: {
    revenue: number | null;
    expenses: number | null;
    cogs: number | null;
    netProfit: number | null;
    netMarginPercent: number | null;
    budgetRevenue: number | null;
    budgetExpenses: number | null;
    revenueVsBudget: number | null;
    revenueVsBudgetPercent: number | null;
    netVsBudget: number | null;
    netVsBudgetPercent: number | null;
  };
};

export type CoachingIntentResolution = {
  mode: "single_period" | "compare_periods" | "clarify";
  periodKeys: string[];
  useSelectedPeriodAsBaseline: boolean;
  clarificationMessage?: string;
};

export const PORTAL_AI_SYSTEM_PROMPT = [
  "You are Kynli AI, the financial assistant inside the Kynli Consulting portal.",
  "Be professional, warm, concise, and easy to understand.",
  "Explain financial and business concepts clearly in plain language.",
  "Never invent or guess tenant-specific numbers or outcomes.",
  "Only use portal data that is explicitly provided in this chat context.",
  "If no relevant portal data is provided, clearly say this version has limited connected data.",
  "Previous conversation messages may be stale or no longer current.",
  "Never treat prior assistant statements as authoritative tenant data.",
  "Current canonical data provided in this request always overrides chat history.",
  "When trigger monitor data is provided: treat status=triggered as requires attention, status=clear as condition not met, status=unknown as not enough information.",
  "Do not convert unknown into positive or negative conclusions.",
  "If asked for values not present in the provided snapshot, say that information is unavailable in the current trigger monitor data.",
  "When financial period summary data is provided, explain only that provided period and metrics.",
  "Do not claim line-item/category/vendor analysis unless line-item data is explicitly provided.",
  "If the user asks for month-over-month or multi-period financial comparison, explain that comparison is not connected yet in this phase.",
].join(" ");

export function buildCoachingIntentResolutionMessages(input: {
  userMessage: string;
  selectedPeriodKey?: string | null;
  availablePeriodKeys: string[];
  availablePeriodHints?: Array<{ key: string; label?: string | null }>;
}): Message[] {
  const selected = input.selectedPeriodKey ?? "none";
  const available = input.availablePeriodKeys;
  const hints = input.availablePeriodHints ?? [];

  const resolverInstructions = [
    "You resolve period-selection intent for Kynli Coaching Trigger Monitor questions.",
    "Infer comparison intent from natural language (not only explicit 'compare').",
    "You MUST select from availablePeriodKeys only.",
    "Selected period is only an anchor, NOT a chronological boundary.",
    "If user explicitly names a period/month that exists in availablePeriodKeys, include it even if it is after selectedPeriodKey.",
    "Interpret 'previous period' as previous AVAILABLE submitted period.",
    "Interpret 'next period' or 'after' as next AVAILABLE submitted period when available.",
    "Interpret 'before' as backward relative to selectedPeriodKey.",
    "If user asks broad range (e.g. whole year/all months) or unclear reference, return mode=clarify with short clarificationMessage.",
    "If user asks 'last two months', use the two latest AVAILABLE periods.",
    "If user references 'this month/current month', use selectedPeriodKey.",
    "If month names are provided without a year, prefer selectedPeriodKey year when possible.",
    "Decide whether the user wants baseline comparison against selectedPeriodKey using useSelectedPeriodAsBaseline.",
    "Set useSelectedPeriodAsBaseline=true for change/difference/improved/worse/better/versus/compared language about another period.",
    "Set useSelectedPeriodAsBaseline=false for standalone period summaries (e.g., summarize July, tell me about July, which triggers fired in July).",
    "Return mode=compare_periods when useSelectedPeriodAsBaseline=true.",
    `Never return more than ${MAX_TRIGGER_PERIODS_PER_REQUEST} period keys.`,
  ].join(" ");

  return [
    { role: "system", content: resolverInstructions },
    {
      role: "system",
      content: `Context: selectedPeriodKey=${selected}; availablePeriodKeys=${JSON.stringify(available)}; availablePeriodHints=${JSON.stringify(hints)}.`,
    },
    { role: "user", content: input.userMessage },
  ];
}

export function buildPortalAiMessages(input: {
  message: string;
  route?: string;
  pageType?: string;
  year?: number;
  month?: number;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  triggerContexts?: PortalAiTriggerContext[];
  triggerContextMissing?: boolean;
  selectedPeriodKey?: string | null;
  triggerClarificationMessage?: string | null;
  comparisonLimitExceeded?: boolean;
  financialContext?: PortalAiFinancialContext | null;
  financialContextMissing?: boolean;
  financialClarificationMessage?: string | null;
  financialUsedLatest?: boolean;
}): Message[] {
  const route = input.route?.trim() || "unknown";
  const pageType = input.pageType?.trim() || "unknown";

  const contextLine = `Page context (informational only): route=${route}, pageType=${pageType}, year=${input.year ?? "n/a"}, month=${input.month ?? "n/a"}. This context is NOT client data.`;

  const selectedLine = input.selectedPeriodKey
    ? `Selected coaching period key: ${input.selectedPeriodKey}.`
    : "Selected coaching period key: unavailable.";

  const coachingContextLine = (input.triggerContexts?.length ?? 0) > 0
    ? `Coaching Trigger Monitor snapshots are provided for ${input.triggerContexts?.map((p) => p.period.key).join(", ")}. Use only provided snapshots.`
    : input.triggerContextMissing
      ? "Coaching Trigger Monitor snapshot data for requested/selected period could not be found. State this clearly and ask user to select or clarify a period."
      : null;

  const clarificationLine = input.triggerClarificationMessage
    ? `Clarification guidance: ${input.triggerClarificationMessage}`
    : null;

  const comparisonLimitLine = input.comparisonLimitExceeded
    ? `Limit note: Kynli AI currently compares up to ${MAX_TRIGGER_PERIODS_PER_REQUEST} trigger periods per request. Ask the user to specify up to three periods.`
    : null;

  const triggerDataBlock = (input.triggerContexts?.length ?? 0) > 0
    ? `Trigger monitor snapshots:\n${JSON.stringify(input.triggerContexts)}`
    : null;

  const financialContextLine = input.financialContext
    ? `Financial summary is provided for ${input.financialContext.period.label} (${input.financialContext.period.key}). Use only this period's metrics.`
    : input.financialContextMissing
      ? "Financial period data for requested/selected/latest period is unavailable. State this clearly and ask user to choose an available submitted financial period."
      : null;

  const financialClarificationLine = input.financialClarificationMessage
    ? `Financial clarification guidance: ${input.financialClarificationMessage}`
    : null;

  const financialUsedLatestLine = input.financialUsedLatest && input.financialContext
    ? `Resolution note: this answer should reference that ${input.financialContext.period.label} is the latest available submitted financial period.`
    : null;

  const financialDataBlock = input.financialContext
    ? `Financial period summary:\n${JSON.stringify(input.financialContext)}`
    : null;

  const historyMessages: Message[] = (input.history || []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return [
    { role: "system", content: PORTAL_AI_SYSTEM_PROMPT },
    { role: "system", content: contextLine },
    { role: "system", content: selectedLine },
    ...(comparisonLimitLine ? [{ role: "system" as const, content: comparisonLimitLine }] : []),
    ...(clarificationLine ? [{ role: "system" as const, content: clarificationLine }] : []),
    ...(coachingContextLine ? [{ role: "system" as const, content: coachingContextLine }] : []),
    ...(triggerDataBlock ? [{ role: "system" as const, content: triggerDataBlock }] : []),
    ...(financialClarificationLine ? [{ role: "system" as const, content: financialClarificationLine }] : []),
    ...(financialContextLine ? [{ role: "system" as const, content: financialContextLine }] : []),
    ...(financialUsedLatestLine ? [{ role: "system" as const, content: financialUsedLatestLine }] : []),
    ...(financialDataBlock ? [{ role: "system" as const, content: financialDataBlock }] : []),
    ...historyMessages,
    { role: "user", content: input.message },
  ];
}
