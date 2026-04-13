/**
 * server/supabase.ts
 * Supabase admin client + all data query helpers.
 * Replaces MySQL/Drizzle for all portal data operations.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

// Service-role client — bypasses RLS, used for all server-side operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type PortalUser = {
  id: number;
  supabase_uid: string | null;
  email: string;
  name: string | null;
  role: "client" | "admin";
  tenant_slug: string | null;
  must_reset_password: boolean;
  created_at: string;
  updated_at: string;
};

export type PortalTenant = {
  id: number;
  slug: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  package_tier: "legacy" | "momentum" | "growth_1" | "growth_2" | "cfo";
  is_active: boolean;
  ghl_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Financial = {
  id: number;
  year: number;
  month: number;
  revenue: number;
  budget_revenue: number;
  expenses: number;
  budget_expenses: number;
  net_profit: number;
  net_profit_margin: number;
};

export type LineItem = {
  id: number;
  year: number;
  month: number;
  type: "income" | "expense";
  label: string;
  amount: number;
};

export type CoachingItem = {
  id: number;
  year: number;
  quarter: number;
  title: string;
  description: string | null;
  completed: boolean;
  sort_order: number;
};

export type KpiMetric = {
  id: number;
  year: number;
  month: number;
  cac: number;
  churn_rate: number;
  ltv: number;
};

export type TimeLog = {
  id: number;
  year: number;
  month: number;
  focus_area: string;
  hours: number;
  delegation_note: string | null;
};

export type SalesTracker = {
  id: number;
  year: number;
  month: number;
  goal_clients: number;
  signed_clients: number;
  referral_count: number;
  outbound_count: number;
};

export type ChatMessage = {
  id: number;
  sender_role: "client" | "admin";
  sender_name: string;
  message: string;
  read: boolean;
  created_at: string;
};

export type ClientRosterEntry = {
  id: number;
  tenant_slug: string;
  client_name: string;
  package_tier: "legacy" | "momentum" | "growth_1" | "growth_2" | "cfo";
  monthly_fee: number;
  signed_at: string;
  status: "active" | "churned";
  total_income: number;
};

export type Document = {
  id: number;
  name: string;
  file_url: string;
  file_key: string;
  doc_type: string;
  description: string | null;
  year: number | null;
  mime_type: string | null;
  created_at: string;
};

// ─── Slug helper ──────────────────────────────────────────────────────────────

export function toClientSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

// ─── Portal Users ─────────────────────────────────────────────────────────────

export async function getPortalUserByUid(uid: string): Promise<PortalUser | null> {
  const { data, error } = await supabase
    .from("portal_users")
    .select("*")
    .eq("supabase_uid", uid)
    .single();
  if (error || !data) return null;
  return data as PortalUser;
}

export async function getPortalUserByEmail(email: string): Promise<PortalUser | null> {
  const { data, error } = await supabase
    .from("portal_users")
    .select("*")
    .eq("email", email)
    .single();
  if (error || !data) return null;
  return data as PortalUser;
}

export async function upsertPortalUser(user: Partial<PortalUser> & { email: string }): Promise<PortalUser | null> {
  const { data, error } = await supabase
    .from("portal_users")
    .upsert(user, { onConflict: "email" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PortalUser;
}

// ─── Portal Tenants ───────────────────────────────────────────────────────────

export async function getTenantBySlug(slug: string): Promise<PortalTenant | null> {
  const { data, error } = await supabase
    .from("portal_tenants")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error || !data) return null;
  return data as PortalTenant;
}

export async function getAllPortalTenants(): Promise<PortalTenant[]> {
  const { data, error } = await supabase
    .from("portal_tenants")
    .select("*")
    .order("company_name");
  if (error) return [];
  return (data || []) as PortalTenant[];
}

export async function upsertPortalTenant(tenant: Partial<PortalTenant> & { slug: string; company_name: string }): Promise<PortalTenant | null> {
  const { data, error } = await supabase
    .from("portal_tenants")
    .upsert(tenant, { onConflict: "slug" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PortalTenant;
}

// ─── Financials ───────────────────────────────────────────────────────────────

export async function getFinancials(slug: string, year: number, month?: number): Promise<Financial[]> {
  let query = supabase
    .from(`${slug}_financials`)
    .select("*")
    .eq("year", year)
    .order("month");
  if (month !== undefined) {
    query = query.eq("month", month);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    revenue: parseFloat(r.revenue as string),
    budget_revenue: parseFloat(r.budget_revenue as string),
    expenses: parseFloat(r.expenses as string),
    budget_expenses: parseFloat(r.budget_expenses as string),
    net_profit: parseFloat(r.net_profit as string),
    net_profit_margin: parseFloat(r.net_profit_margin as string),
  })) as Financial[];
}

export async function upsertFinancial(slug: string, data: Omit<Financial, "id">): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_financials`)
    .upsert(data, { onConflict: "year,month" });
  if (error) throw new Error(error.message);
}

// ─── Line Items ───────────────────────────────────────────────────────────────

export async function getLineItems(slug: string, year: number, month: number): Promise<LineItem[]> {
  const { data, error } = await supabase
    .from(`${slug}_line_items`)
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .order("type")
    .order("amount", { ascending: false });
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({ ...r, amount: parseFloat(r.amount as string) })) as LineItem[];
}

export async function getLineItemsByYear(slug: string, year: number): Promise<LineItem[]> {
  const { data, error } = await supabase
    .from(`${slug}_line_items`)
    .select("*")
    .eq("year", year)
    .order("month")
    .order("type")
    .order("amount", { ascending: false });
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({ ...r, amount: parseFloat(r.amount as string) })) as LineItem[];
}

export async function insertLineItem(slug: string, item: Omit<LineItem, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from(`${slug}_line_items`).insert(item);
  if (error) throw new Error(error.message);
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getDocuments(slug: string, year?: number): Promise<Document[]> {
  let query = supabase
    .from(`${slug}_documents`)
    .select("*")
    .order("created_at", { ascending: false });
  if (year !== undefined) {
    query = query.eq("year", year);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data || []) as Document[];
}

export async function insertDocument(slug: string, doc: Omit<Document, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from(`${slug}_documents`).insert(doc);
  if (error) throw new Error(error.message);
}

export async function deleteDocument(slug: string, id: number): Promise<void> {
  const { error } = await supabase.from(`${slug}_documents`).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Coaching ─────────────────────────────────────────────────────────────────

export async function getCoachingItems(slug: string, year?: number, quarter?: number): Promise<CoachingItem[]> {
  let query = supabase
    .from(`${slug}_coaching`)
    .select("*")
    .order("sort_order");
  if (year !== undefined) query = query.eq("year", year);
  if (quarter !== undefined) query = query.eq("quarter", quarter);
  const { data, error } = await query;
  if (error) return [];
  return (data || []) as CoachingItem[];
}

export async function insertCoachingItem(slug: string, item: Omit<CoachingItem, "id" | "created_at" | "updated_at">): Promise<void> {
  const { error } = await supabase.from(`${slug}_coaching`).insert(item);
  if (error) throw new Error(error.message);
}

export async function toggleCoachingItem(slug: string, id: number, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_coaching`)
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCoachingItem(slug: string, id: number): Promise<void> {
  const { error } = await supabase.from(`${slug}_coaching`).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── KPI Metrics ──────────────────────────────────────────────────────────────

export async function getKpiMetrics(slug: string, year: number): Promise<KpiMetric[]> {
  const { data, error } = await supabase
    .from(`${slug}_kpi_metrics`)
    .select("*")
    .eq("year", year)
    .order("month");
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    cac: parseFloat(r.cac as string),
    churn_rate: parseFloat(r.churn_rate as string),
    ltv: parseFloat(r.ltv as string),
  })) as KpiMetric[];
}

export async function upsertKpiMetric(slug: string, data: Omit<KpiMetric, "id">): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_kpi_metrics`)
    .upsert(data, { onConflict: "year,month" });
  if (error) throw new Error(error.message);
}

// ─── Time Logs ────────────────────────────────────────────────────────────────

export async function getTimeLogs(slug: string, year: number, month: number): Promise<TimeLog[]> {
  const { data, error } = await supabase
    .from(`${slug}_time_logs`)
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .order("hours", { ascending: false });
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({ ...r, hours: parseFloat(r.hours as string) })) as TimeLog[];
}

export async function insertTimeLog(slug: string, log: Omit<TimeLog, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from(`${slug}_time_logs`).insert(log);
  if (error) throw new Error(error.message);
}

// ─── Sales Tracker ────────────────────────────────────────────────────────────

export async function getSalesTracker(slug: string, year: number, month: number): Promise<SalesTracker | null> {
  const { data, error } = await supabase
    .from(`${slug}_sales_tracker`)
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .single();
  if (error || !data) return null;
  return data as SalesTracker;
}

export async function getSalesTrackerByYear(slug: string, year: number): Promise<SalesTracker[]> {
  const { data, error } = await supabase
    .from(`${slug}_sales_tracker`)
    .select("*")
    .eq("year", year)
    .order("month");
  if (error) return [];
  return (data || []) as SalesTracker[];
}

export async function upsertSalesTracker(slug: string, data: Omit<SalesTracker, "id">): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_sales_tracker`)
    .upsert(data, { onConflict: "year,month" });
  if (error) throw new Error(error.message);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function getChatMessages(slug: string, limit = 50): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from(`${slug}_chat`)
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data || []) as ChatMessage[];
}

export async function insertChatMessage(slug: string, msg: Omit<ChatMessage, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from(`${slug}_chat`).insert(msg);
  if (error) throw new Error(error.message);
}

// ─── Client Roster ────────────────────────────────────────────────────────────

export async function getClientRoster(slug: string): Promise<ClientRosterEntry[]> {
  const { data, error } = await supabase
    .from("client_roster")
    .select("*")
    .eq("tenant_slug", slug)
    .order("signed_at", { ascending: false });
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    monthly_fee: parseFloat(r.monthly_fee as string),
    total_income: parseFloat(r.total_income as string),
  })) as ClientRosterEntry[];
}

export async function insertClientRosterEntry(entry: Omit<ClientRosterEntry, "id" | "created_at" | "updated_at">): Promise<void> {
  const { error } = await supabase.from("client_roster").insert(entry);
  if (error) throw new Error(error.message);
}
