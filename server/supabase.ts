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

export type StaffRole = "admin" | "accounting_manager" | "tax_manager" | "accountant";
export type UserRole = StaffRole | "client";

export type PortalUser = {
  id: number;
  supabase_uid: string | null;
  email: string;
  name: string | null;
  role: UserRole;
  tenant_slug: string | null;
  must_reset_password: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffAssignment = {
  id: number;
  staff_id: number;
  tenant_slug: string;
  assigned_at: string;
};

export type PortalTenant = {
  id: number;
  slug: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  package_tier: "legacy" | "momentum" | "growth_1" | "growth_2" | "cfo";
  is_active: boolean;
  is_churned: boolean;
  ghl_notes: string | null;
  invite_sent_at: string | null;
  invite_accepted: boolean;
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
  description: string | null;
  doc_type: string;
  file_key: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  year: number;
  month: number | null;       // 1–12
  uploaded_by_name: string | null;
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

// ─── Tenant Lifecycle ────────────────────────────────────────────────────────

/**
 * Archive a tenant: marks as churned (is_churned=true, is_active=false).
 * The client's portal access is effectively disabled.
 */
export async function archiveTenant(slug: string): Promise<void> {
  const { error } = await supabase
    .from("portal_tenants")
    .update({ is_churned: true, is_active: false })
    .eq("slug", slug);
  if (error) throw new Error(error.message);
}

/**
 * Restore a churned tenant back to active.
 */
export async function restoreTenant(slug: string): Promise<void> {
  const { error } = await supabase
    .from("portal_tenants")
    .update({ is_churned: false, is_active: true })
    .eq("slug", slug);
  if (error) throw new Error(error.message);
}

/**
 * Hard delete a tenant row. Use with caution — irreversible.
 * Does NOT delete the per-client Supabase tables (data is preserved).
 */
export async function deleteTenant(slug: string): Promise<void> {
  const { error } = await supabase
    .from("portal_tenants")
    .delete()
    .eq("slug", slug);
  if (error) throw new Error(error.message);
}

// ─── Client Invite ───────────────────────────────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Kynli Consulting <invite@kynliconsulting.com>";
  return { apiKey, fromEmail };
}

type InviteEmailVariant = "invite" | "access";

async function sendKynliInviteEmail(params: {
  to: string;
  companyName: string;
  inviteLink: string;
  variant: InviteEmailVariant;
}): Promise<void> {
  const { apiKey, fromEmail } = getResendConfig();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const { to, companyName, inviteLink, variant } = params;

  const isInvite = variant === "invite";
  const subject = isInvite ? "You’re invited to Kynli Portal" : "Access Your Kynli Portal";
  const heading = isInvite ? "Kynli Portal Invite" : "Access Your Kynli Portal";
  const intro = isInvite
    ? "You're invited to access your Kynli client portal."
    : "Use the secure link below to access your Kynli client portal.";
  const buttonLabel = isInvite ? "Accept Invite" : "Access Your Portal";

  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="margin: 0 0 8px; font-size: 22px;">${heading}</h2>
        <p style="margin: 0 0 16px; color: #4b5563;">${intro}</p>
        <p style="margin: 0 0 8px;"><strong>Company:</strong> ${companyName}</p>
        <p style="margin: 0 0 20px; color: #4b5563;">Welcome! Click below to continue.</p>
        <a href="${inviteLink}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">${buttonLabel}</a>
        <p style="margin: 20px 0 8px; color: #6b7280; font-size: 13px;">If the button doesn’t work, use this link:</p>
        <p style="word-break: break-all; margin: 0; font-size: 13px;"><a href="${inviteLink}">${inviteLink}</a></p>
      </div>
    </div>
  `;

  const text = [
    subject,
    "",
    `Company: ${companyName}`,
    `Use this link to continue:`,
    inviteLink,
  ].join("\n");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend send failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`);
  }
}

/**
 * Generates a Supabase invite link and sends a branded email through Resend.
 * Returns { sent: true } on success.
 */
export async function inviteClientByEmail(
  email: string,
  name: string,
  tenantSlug: string,
  redirectTo: string,
): Promise<{ sent: boolean; error?: string }> {
  type GeneratedLinkResult = {
    user?: { id?: string | null } | null;
    properties?: {
      action_link?: string | null;
      email_otp?: string | null;
    } | null;
  };

  let linkData: GeneratedLinkResult | null = null;
  let emailVariant: InviteEmailVariant = "invite";

  // 1) Try invite link first (new users)
  {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: { name, tenant_slug: tenantSlug },
      },
    });

    if (!error && data) {
      linkData = data;
      emailVariant = "invite";
      console.info("[inviteClientByEmail] new invite link generated", {
        linkTypeUsed: "invite",
        recipientEmail: email,
        redirectTo,
      });
    } else {
      const message = error?.message ?? "Invite link generation failed";
      const msg = message.toLowerCase();
      const isExistingUser =
        msg.includes("already") ||
        msg.includes("exists") ||
        msg.includes("registered") ||
        msg.includes("invitee already") ||
        msg.includes("user already");

      if (!isExistingUser) {
        console.error(`[inviteClientByEmail] generateLink(invite) failed for ${email}:`, message);
        return { sent: false, error: message };
      }

      console.info("[inviteClientByEmail] existing user detected", {
        email,
        tenantSlug,
        reason: message,
      });

      // 2) Existing users: fallback to magic link
      const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo,
        },
      });

      if (magicError || !magicData) {
        const magicMessage = magicError?.message ?? "Magic link generation failed";
        console.error(`[inviteClientByEmail] generateLink(magiclink) failed for ${email}:`, magicMessage);
        return { sent: false, error: magicMessage };
      }

      linkData = magicData;
      emailVariant = "access";
      console.info("[inviteClientByEmail] magic link generated", {
        linkTypeUsed: "magiclink",
        recipientEmail: email,
        redirectTo,
      });
    }
  }

  const inviteLink = linkData?.properties?.action_link || linkData?.properties?.email_otp || "";

  if (!inviteLink) {
    const errMsg = "Supabase generateLink did not return an action link";
    console.error(`[inviteClientByEmail] ${errMsg} for ${email}`);
    return { sent: false, error: errMsg };
  }

  // 3) Send branded email via Resend
  try {
    await sendKynliInviteEmail({
      to: email,
      companyName: name,
      inviteLink,
      variant: emailVariant,
    });
    console.info("[inviteClientByEmail] Resend send success", {
      recipientEmail: email,
      redirectTo,
      linkTypeUsed: emailVariant === "invite" ? "invite" : "magiclink",
      resendSentSuccessfully: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.error("[inviteClientByEmail] Resend send failure", { email, tenantSlug, error: message });
    return { sent: false, error: message };
  }

  // 4) Mark invite metadata only after email send succeeds
  const supabaseUid = linkData?.user?.id ?? null;
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase.from("portal_users").upsert(
    {
      supabase_uid: supabaseUid,
      email,
      name,
      role: "client",
      tenant_slug: tenantSlug,
      must_reset_password: false,
      invite_sent_at: nowIso,
      invite_accepted: false,
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    return { sent: false, error: upsertError.message };
  }

  const { error: tenantUpdateError } = await supabase
    .from("portal_tenants")
    .update({ invite_sent_at: nowIso })
    .eq("slug", tenantSlug);

  if (tenantUpdateError) {
    return { sent: false, error: tenantUpdateError.message };
  }

  return { sent: true };
}

export async function markInviteAccepted(email: string): Promise<void> {
  await supabase
    .from("portal_users")
    .update({ invite_accepted: true })
    .eq("email", email);
  // Also mark on tenant record (best-effort)
  const { data: user } = await supabase
    .from("portal_users")
    .select("tenant_slug")
    .eq("email", email)
    .single();
  if (user?.tenant_slug) {
    await supabase
      .from("portal_tenants")
      .update({ invite_accepted: true })
      .eq("slug", user.tenant_slug);
  }
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

export async function getDocuments(
  slug: string,
  year?: number,
  month?: number,
  docType?: string,
): Promise<Document[]> {
  let query = supabase
    .from(`${slug}_documents`)
    .select("*")
    .order("created_at", { ascending: false });
  if (year !== undefined) query = query.eq("year", year);
  if (month !== undefined) query = query.eq("month", month);
  if (docType && docType !== "All Types") query = query.eq("doc_type", docType);
  const { data, error } = await query;
  if (error) {
    console.error(`[getDocuments] ${slug}:`, error.message);
    return [];
  }
  return (data || []) as Document[];
}

export async function insertDocument(
  slug: string,
  doc: Omit<Document, "id" | "created_at">,
): Promise<Document> {
  const { data, error } = await supabase
    .from(`${slug}_documents`)
    .insert(doc)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Document;
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

// ─── Tenant Provisioning ──────────────────────────────────────────────────────

export type ProvisionResult = {
  success: boolean;
  tables_created: string[];
  tables_existed: string[];
  errors: { table: string; error: string }[];
};

/**
 * Provisions all required Supabase tables for a new tenant.
 * Uses raw SQL via the service role client so it can CREATE TABLE IF NOT EXISTS.
 * Safe to call multiple times — idempotent.
 */
export async function provisionTenant(slug: string): Promise<ProvisionResult> {
  // Validate slug — only allow alphanumeric + underscores to prevent SQL injection
  if (!/^[a-z0-9_]+$/.test(slug)) {
    throw new Error(`Invalid slug: "${slug}". Only lowercase letters, numbers, and underscores are allowed.`);
  }

  const result: ProvisionResult = { success: true, tables_created: [], tables_existed: [], errors: [] };

  const tableDefs: { name: string; sql: string }[] = [
    {
      name: `${slug}_chat`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_chat (
          id              BIGSERIAL PRIMARY KEY,
          sender          TEXT NOT NULL,
          message         TEXT,
          role            TEXT NOT NULL DEFAULT 'client',
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sender_user_id  INTEGER,
          file_key        TEXT,
          file_url        TEXT,
          file_name       TEXT,
          file_size       BIGINT,
          mime_type       TEXT,
          archive_year    INTEGER,
          archive_month   INTEGER,
          portal_document_id INTEGER,
          thread_id       BIGINT REFERENCES ${slug}_chat(id) ON DELETE CASCADE,
          reply_count     INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_chat_created_at ON ${slug}_chat(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_${slug}_chat_thread_id ON ${slug}_chat(thread_id) WHERE thread_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_${slug}_chat_fts ON ${slug}_chat USING gin(to_tsvector('english', coalesce(message, '')));
      `,
    },
    {
      name: `${slug}_documents`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_documents (
          id               BIGSERIAL PRIMARY KEY,
          name             TEXT NOT NULL,
          description      TEXT,
          doc_type         TEXT NOT NULL DEFAULT 'Other',
          file_key         TEXT NOT NULL,
          file_url         TEXT NOT NULL,
          file_name        TEXT,
          file_size        BIGINT,
          mime_type        TEXT,
          year             INTEGER NOT NULL,
          month            INTEGER,
          uploaded_by_name TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_documents_year_month ON ${slug}_documents(year, month);
        CREATE INDEX IF NOT EXISTS idx_${slug}_documents_doc_type ON ${slug}_documents(doc_type);
      `,
    },
    {
      name: `${slug}_financials`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_financials (
          id                   BIGSERIAL PRIMARY KEY,
          year                 INTEGER NOT NULL,
          month                INTEGER NOT NULL,
          revenue              NUMERIC(15,2) NOT NULL DEFAULT 0,
          budget_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0,
          expenses             NUMERIC(15,2) NOT NULL DEFAULT 0,
          budget_expenses      NUMERIC(15,2) NOT NULL DEFAULT 0,
          net_profit           NUMERIC(15,2) NOT NULL DEFAULT 0,
          net_profit_margin    NUMERIC(8,4) NOT NULL DEFAULT 0,
          summary              TEXT,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(year, month)
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_financials_year_month ON ${slug}_financials(year, month);
      `,
    },
    {
      name: `${slug}_line_items`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_line_items (
          id          BIGSERIAL PRIMARY KEY,
          year        INTEGER NOT NULL,
          month       INTEGER NOT NULL,
          category    TEXT NOT NULL,
          label       TEXT NOT NULL,
          amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
          type        TEXT NOT NULL DEFAULT 'expense',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_line_items_year_month ON ${slug}_line_items(year, month);
      `,
    },
    {
      name: `${slug}_coaching_notes`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_coaching_notes (
          id          BIGSERIAL PRIMARY KEY,
          year        INTEGER NOT NULL,
          quarter     INTEGER NOT NULL,
          content     TEXT NOT NULL DEFAULT '',
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(year, quarter)
        );
      `,
    },
    {
      name: `${slug}_coaching_items`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_coaching_items (
          id          BIGSERIAL PRIMARY KEY,
          year        INTEGER NOT NULL,
          quarter     INTEGER NOT NULL,
          text        TEXT NOT NULL,
          completed   BOOLEAN NOT NULL DEFAULT FALSE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_coaching_items_year_quarter ON ${slug}_coaching_items(year, quarter);
      `,
    },
    {
      name: `${slug}_kpi_metrics`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_kpi_metrics (
          id          BIGSERIAL PRIMARY KEY,
          year        INTEGER NOT NULL,
          month       INTEGER NOT NULL,
          label       TEXT NOT NULL,
          value       NUMERIC(15,2) NOT NULL DEFAULT 0,
          target      NUMERIC(15,2),
          unit        TEXT,
          category    TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_kpi_metrics_year_month ON ${slug}_kpi_metrics(year, month);
      `,
    },
    {
      name: `${slug}_sales_tracker`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_sales_tracker (
          id              BIGSERIAL PRIMARY KEY,
          year            INTEGER NOT NULL,
          month           INTEGER NOT NULL,
          label           TEXT NOT NULL,
          actual          NUMERIC(15,2) NOT NULL DEFAULT 0,
          target          NUMERIC(15,2),
          category        TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_sales_tracker_year_month ON ${slug}_sales_tracker(year, month);
      `,
    },
    {
      name: `${slug}_time_intelligence`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_time_intelligence (
          id          BIGSERIAL PRIMARY KEY,
          year        INTEGER NOT NULL,
          month       INTEGER NOT NULL,
          category    TEXT NOT NULL,
          hours       NUMERIC(8,2) NOT NULL DEFAULT 0,
          label       TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${slug}_time_intelligence_year_month ON ${slug}_time_intelligence(year, month);
      `,
    },
    {
      name: `${slug}_ai_summaries`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_ai_summaries (
          id            BIGSERIAL PRIMARY KEY,
          year          INTEGER NOT NULL,
          month         INTEGER NOT NULL,
          content       TEXT NOT NULL DEFAULT '',
          generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(year, month)
        );
      `,
    },
    {
      name: `${slug}_client_roster`,
      sql: `
        CREATE TABLE IF NOT EXISTS ${slug}_client_roster (
          id              BIGSERIAL PRIMARY KEY,
          name            TEXT NOT NULL,
          service         TEXT,
          tenure_months   INTEGER NOT NULL DEFAULT 0,
          ltv             NUMERIC(15,2) NOT NULL DEFAULT 0,
          status          TEXT NOT NULL DEFAULT 'active',
          notes           TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
  ];

  for (const def of tableDefs) {
    try {
      // Check if table already exists
      const { error: checkError } = await supabase
        .from(def.name)
        .select("id")
        .limit(1);

      if (!checkError) {
        // Table exists (no error means it's accessible)
        result.tables_existed.push(def.name);
        continue;
      }

      // Table doesn't exist — create it using rpc exec_sql
      const { error: createError } = await supabase.rpc("exec_sql", { sql: def.sql });
      if (createError) {
        result.errors.push({ table: def.name, error: createError.message });
        result.success = false;
      } else {
        result.tables_created.push(def.name);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ table: def.name, error: msg });
      result.success = false;
    }
  }

  return result;
}

// ─── Staff / Team Management ──────────────────────────────────────────────────

export const STAFF_ROLES: StaffRole[] = [
  "admin",
  "accounting_manager",
  "tax_manager",
  "accountant",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  accounting_manager: "Accounting Manager",
  tax_manager: "Tax Manager",
  accountant: "Accountant",
};

/** List all staff members (non-client portal_users) */
export async function listStaff(): Promise<PortalUser[]> {
  const { data, error } = await supabase
    .from("portal_users")
    .select("*")
    .in("role", STAFF_ROLES)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listStaff: ${error.message}`);
  return (data ?? []) as PortalUser[];
}

/** Get a single staff member by id */
export async function getStaffById(id: number): Promise<PortalUser | null> {
  const { data, error } = await supabase
    .from("portal_users")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as PortalUser;
}

/** Create a new staff member (supabase_uid filled in later after auth invite) */
export async function createStaffMember(params: {
  email: string;
  name: string;
  role: StaffRole;
}): Promise<PortalUser> {
  const { data, error } = await supabase
    .from("portal_users")
    .insert({
      email: params.email,
      name: params.name,
      role: params.role,
      tenant_slug: null,
      must_reset_password: true,
    })
    .select()
    .single();
  if (error) throw new Error(`createStaffMember: ${error.message}`);
  return data as PortalUser;
}

/** Update a staff member's role and/or name */
export async function updateStaffMember(
  id: number,
  updates: Partial<{ name: string; role: StaffRole }>
): Promise<PortalUser> {
  const { data, error } = await supabase
    .from("portal_users")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateStaffMember: ${error.message}`);
  return data as PortalUser;
}

/** Remove a staff member from portal_users */
export async function removeStaffMember(id: number): Promise<void> {
  const { error } = await supabase
    .from("portal_users")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`removeStaffMember: ${error.message}`);
}

/** Get all client assignments for a staff member */
export async function getStaffAssignments(staffId: number): Promise<StaffAssignment[]> {
  const { data, error } = await supabase
    .from("staff_client_assignments")
    .select("*")
    .eq("staff_id", staffId)
    .order("assigned_at", { ascending: true });
  if (error) throw new Error(`getStaffAssignments: ${error.message}`);
  return (data ?? []) as StaffAssignment[];
}

/** Get all staff assigned to a specific tenant */
export async function getAssignedStaff(tenantSlug: string): Promise<PortalUser[]> {
  const { data, error } = await supabase
    .from("staff_client_assignments")
    .select("staff_id, portal_users(*)")
    .eq("tenant_slug", tenantSlug);
  if (error) throw new Error(`getAssignedStaff: ${error.message}`);
  return ((data ?? []).map((r: Record<string, unknown>) => r.portal_users).filter(Boolean)) as PortalUser[];
}

/** Assign a staff member to a client tenant */
export async function assignStaffToClient(staffId: number, tenantSlug: string): Promise<void> {
  const { error } = await supabase
    .from("staff_client_assignments")
    .upsert({ staff_id: staffId, tenant_slug: tenantSlug }, { onConflict: "staff_id,tenant_slug" });
  if (error) throw new Error(`assignStaffToClient: ${error.message}`);
}

/** Remove a staff member from a client tenant */
export async function unassignStaffFromClient(staffId: number, tenantSlug: string): Promise<void> {
  const { error } = await supabase
    .from("staff_client_assignments")
    .delete()
    .eq("staff_id", staffId)
    .eq("tenant_slug", tenantSlug);
  if (error) throw new Error(`unassignStaffFromClient: ${error.message}`);
}
