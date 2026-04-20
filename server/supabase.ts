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
  summary?: string | null;
};

export type LineItem = {
  id: number;
  year: number;
  month: number;
  type: "income" | "expense";
  label: string;
  amount: number;
  budget_amount?: number | null;
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
  log_date: string | null;
  team_member: string | null;
  task_category: string | null;
  focus_area: string;
  hours: number;
  minutes: number | null;
  delegation_note: string | null;
  created_at?: string;
};

export type TeamMember = {
  id: number;
  slug: string;
  name: string;
  created_at?: string;
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
  sender_user_id: number | null;
  sender_role: "client" | "admin";
  sender_name: string;
  message: string | null;       // null if file-only message
  read: boolean;
  // File attachment fields (null if text-only)
  file_key: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  // Auto-archive classification
  archive_year: number | null;
  archive_month: number | null; // 1–12
  portal_document_id: number | null;
  // Thread support
  thread_id: number | null;    // null = top-level message; set = reply to thread_id
  reply_count: number;         // denormalized count of direct replies
  created_at: string;
};

export type ClientRosterEntry = {
  id: number;
  client_name: string;
  package: string;
  monthly_amount: number;
  signed_date: string | null;
  status: "active" | "churned";
  tenure_months: number;
  ltv: number;
  total_income: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export async function updateFinancialSummary(slug: string, year: number, month: number, summary: string): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_financials`)
    .update({ summary })
    .eq("year", year)
    .eq("month", month);
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

export async function getChatMessages(
  slug: string,
  limit = 200,
  beforeId?: number,
  search?: string
): Promise<ChatMessage[]> {
  // Only fetch top-level messages (thread_id IS NULL) in the main feed
  let query = supabase
    .from(`${slug}_chat`)
    .select("*")
    .is("thread_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (beforeId !== undefined) {
    query = query.lt("id", beforeId);
  }
  if (search && search.trim()) {
    query = query.ilike("message", `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) return [];
  // Return oldest-first for display
  return ((data || []) as ChatMessage[]).reverse();
}

export async function getThreadReplies(
  slug: string,
  parentId: number
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from(`${slug}_chat`)
    .select("*")
    .eq("thread_id", parentId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data || []) as ChatMessage[];
}

export async function incrementReplyCount(
  slug: string,
  parentId: number
): Promise<void> {
  // Use raw SQL RPC or a simple read-increment-write (Supabase doesn't support atomic increment natively via JS client without RPC)
  const { data: row } = await supabase
    .from(`${slug}_chat`)
    .select("reply_count")
    .eq("id", parentId)
    .single();
  const current = (row as any)?.reply_count ?? 0;
  await supabase
    .from(`${slug}_chat`)
    .update({ reply_count: current + 1 })
    .eq("id", parentId);
}

export async function insertChatMessageSupabase(
  slug: string,
  msg: Omit<ChatMessage, "id" | "created_at">
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from(`${slug}_chat`)
    .insert(msg)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ChatMessage;
}

export async function deleteChatMessageSupabase(
  slug: string,
  id: number
): Promise<void> {
  const { error } = await supabase.from(`${slug}_chat`).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Client Roster ────────────────────────────────────────────────────────────

export async function getClientRoster(slug: string): Promise<ClientRosterEntry[]> {
  const { data, error } = await supabase
    .from(`${slug}_client_roster`)
    .select("*")
    .order("client_name", { ascending: true });
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    monthly_amount: parseFloat((r.monthly_amount ?? 0) as string),
    ltv: parseFloat((r.ltv ?? 0) as string),
    total_income: parseFloat((r.total_income ?? 0) as string),
    tenure_months: Number(r.tenure_months ?? 0),
  })) as ClientRosterEntry[];
}

export async function upsertClientRosterEntry(
  slug: string,
  entry: Omit<ClientRosterEntry, "id" | "created_at" | "updated_at">
): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_client_roster`)
    .insert({ ...entry, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function updateClientRosterEntry(
  slug: string,
  id: number,
  entry: Partial<Omit<ClientRosterEntry, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_client_roster`)
    .update({ ...entry, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteClientRosterEntry(slug: string, id: number): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_client_roster`)
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Team Members ─────────────────────────────────────────────────────────────
export async function getTeamMembers(slug: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("slug", slug)
    .order("name");
  if (error) return [];
  return (data || []) as TeamMember[];
}

export async function addTeamMember(slug: string, name: string): Promise<void> {
  const { error } = await supabase.from("team_members").insert({ slug, name });
  if (error) throw new Error(error.message);
}

export async function deleteTeamMember(slug: string, id: number): Promise<void> {
  const { error } = await supabase.from("team_members").delete().eq("id", id).eq("slug", slug);
  if (error) throw new Error(error.message);
}

export async function getTimeLogsByYear(slug: string, year: number): Promise<TimeLog[]> {
  const { data, error } = await supabase
    .from(`${slug}_time_logs`)
    .select("*")
    .eq("year", year)
    .order("month", { ascending: false })
    .order("hours", { ascending: false });
  if (error) return [];
  return (data || []).map((r: Record<string, unknown>) => ({ ...r, hours: parseFloat(r.hours as string) })) as TimeLog[];
}

// ─── Focus Areas ──────────────────────────────────────────────────────────────
export type FocusArea = {
  id: number;
  slug: string;
  label: string;
};

export async function getFocusAreas(slug: string): Promise<FocusArea[]> {
  const { data, error } = await supabase
    .from("focus_areas")
    .select("*")
    .eq("slug", slug)
    .order("label");
  if (error) return [];
  return (data || []) as FocusArea[];
}

export async function addFocusArea(slug: string, label: string): Promise<void> {
  const { error } = await supabase.from("focus_areas").insert({ slug, label });
  if (error) throw new Error(error.message);
}

export async function deleteFocusArea(slug: string, id: number): Promise<void> {
  const { error } = await supabase.from("focus_areas").delete().eq("id", id).eq("slug", slug);
  if (error) throw new Error(error.message);
}

// ─── Coaching Notes (free-text per quarter) ───────────────────────────────────

export type CoachingNote = {
  id: number;
  year: number;
  quarter: number;
  content: string;
  created_at?: string;
  updated_at?: string;
};

export async function getCoachingNote(slug: string, year: number, quarter: number): Promise<CoachingNote | null> {
  const { data, error } = await supabase
    .from(`${slug}_coaching_notes`)
    .select("*")
    .eq("year", year)
    .eq("quarter", quarter)
    .single();
  if (error || !data) return null;
  return data as CoachingNote;
}

export async function upsertCoachingNote(slug: string, year: number, quarter: number, content: string): Promise<void> {
  const { error } = await supabase
    .from(`${slug}_coaching_notes`)
    .upsert({ year, quarter, content, updated_at: new Date().toISOString() }, { onConflict: "year,quarter" });
  if (error) throw new Error(error.message);
}
