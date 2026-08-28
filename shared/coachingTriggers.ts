export type CoachingTriggerSourceType = "financial" | "operational";

export type CoachingTriggerKey =
  | "negative_net_income"
  | "net_income_over_30k"
  | "net_income_10_percent_or_less"
  | "high_cogs_over_50"
  | "team_pay_over_55"
  | "ar_over_90_days"
  | "projected_ye_net_income_over_150k"
  | "no_savings_account"
  | "no_tax_savings_account"
  | "revenue_static_or_decreasing"
  | "monthly_tech_increasing"
  | "high_owner_distributions"
  | "low_cash_balance"
  | "high_credit_card_balance"
  | "no_tiered_pricing"
  | "time_not_tracked"
  | "churn_not_improving";

export type CoachingTriggerDefinition = {
  trigger_key: CoachingTriggerKey;
  label: string;
  order: number;
  source_type: CoachingTriggerSourceType;
};

export const COACHING_TRIGGERS: CoachingTriggerDefinition[] = [
  { trigger_key: "negative_net_income", label: "Negative Net Income", order: 1, source_type: "financial" },
  { trigger_key: "net_income_over_30k", label: "Net Income Over $30K", order: 2, source_type: "financial" },
  { trigger_key: "net_income_10_percent_or_less", label: "Net Income 10% or Less", order: 3, source_type: "financial" },
  { trigger_key: "high_cogs_over_50", label: "High COGS Over 50%", order: 4, source_type: "financial" },
  { trigger_key: "team_pay_over_55", label: "Team Pay Over 55%", order: 5, source_type: "financial" },
  { trigger_key: "ar_over_90_days", label: "A/R Over 90 Days", order: 6, source_type: "financial" },
  { trigger_key: "projected_ye_net_income_over_150k", label: "Projected YE Net Income Over $150K", order: 7, source_type: "financial" },
  { trigger_key: "no_savings_account", label: "No Savings Account", order: 8, source_type: "financial" },
  { trigger_key: "no_tax_savings_account", label: "No Tax Savings Account", order: 9, source_type: "financial" },
  { trigger_key: "revenue_static_or_decreasing", label: "Revenue Static or Decreasing", order: 10, source_type: "financial" },
  { trigger_key: "monthly_tech_increasing", label: "Monthly Tech Increasing", order: 11, source_type: "financial" },
  { trigger_key: "high_owner_distributions", label: "High Owner Distributions", order: 12, source_type: "financial" },
  { trigger_key: "low_cash_balance", label: "Low Cash Balance", order: 13, source_type: "financial" },
  { trigger_key: "high_credit_card_balance", label: "High Credit Card Balance", order: 14, source_type: "financial" },
  { trigger_key: "no_tiered_pricing", label: "No Tiered Pricing", order: 15, source_type: "operational" },
  { trigger_key: "time_not_tracked", label: "Time Not Tracked", order: 16, source_type: "operational" },
  { trigger_key: "churn_not_improving", label: "Churn Not Improving", order: 17, source_type: "operational" },
];

export const FINANCIAL_TRIGGER_KEYS = COACHING_TRIGGERS
  .filter((t) => t.source_type === "financial")
  .map((t) => t.trigger_key) as CoachingTriggerKey[];

export const OPERATIONAL_TRIGGER_KEYS = COACHING_TRIGGERS
  .filter((t) => t.source_type === "operational")
  .map((t) => t.trigger_key) as CoachingTriggerKey[];

export const COACHING_TRIGGER_KEYS = COACHING_TRIGGERS.map((t) => t.trigger_key) as CoachingTriggerKey[];
