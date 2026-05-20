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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isLikelyServiceRoleKey(key: string): boolean {
  const payload = decodeJwtPayload(key);
  if (!payload) return false;
  return payload.role === "service_role" || payload.supabase_admin === true;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
  return msg.includes("schema cache") && msg.includes(columnName.toLowerCase());
}

// Service-role client — bypasses RLS, used for all server-side operations
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  },
});

const PROD_PORTAL_ORIGIN = "https://portal.kynliconsulting.com";

function getInviteRedirectTo(portalOrigin?: string): string {
  if (process.env.NODE_ENV === "production") {
    return `${PROD_PORTAL_ORIGIN}/auth/callback`;
  }

  const origin = (portalOrigin && portalOrigin.trim()) || "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/auth/callback`;
}

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
  invite_sent_at?: string | null;
  invite_accepted?: boolean;
  created_at: string;
  updated_at: string;
};

export type TenantMember = {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  tenant_slug: string | null;
  invite_sent_at?: string | null;
  invite_accepted?: boolean;
  source: "tenant_user" | "staff_assignment";
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
  // Legacy compatibility (older tenant chat tables)
  sender?: string | null;
  role?: string | null;
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
  // Lightweight reply metadata (global chat)
  reply_to_message_id?: number | null;
  reply_to_sender_name?: string | null;
  reply_to_message_preview?: string | null;
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
  id: string;
  tenant_slug: string | null;
  organization_id: string | null;
  client_id: string | null;
  name: string;
  description: string | null;
  doc_type: string | null;
  file_key: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  year: number | null;
  month: number | null;       // 1–12
  uploaded_by_name: string | null;
  uploaded_by_user_id: string | null;
  created_at: string;
  updated_at?: string;
};

// ─── Slug helper ──────────────────────────────────────────────────────────────

export function toClientSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export function sanitizeTenantSlug(raw: unknown): string {
  const input = typeof raw === "string" ? raw : raw == null ? "" : String(raw);

  let slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!slug) slug = "tenant";
  if (/^[0-9]/.test(slug)) slug = `t_${slug}`;

  return slug;
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
  const subject = isInvite
    ? "You’ve Been Invited to Kynli"
    : "Your Kynli Workspace Access Link";
  const heading = "You’ve Been Invited to Kynli";
  const intro = "You’ve been invited to join the secure workspace for your organization.";
  const contextLine = isInvite
    ? "Use the button below to accept your invitation and collaborate securely."
    : "Use the button below to access your workspace and continue collaborating securely.";
  const buttonLabel = isInvite ? "Accept Invitation" : "Open Workspace";

  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; color: #E5E7EB; padding: 20px;">
      <div style="background: linear-gradient(180deg, #0F172A 0%, #0B1220 100%); border: 1px solid #1F2937; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 45px rgba(0,0,0,0.35);">
        <div style="padding: 24px 24px 20px; border-bottom: 1px solid rgba(148,163,184,0.16);">
          <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #94A3B8;">Kynli Consulting</p>
          <h2 style="margin: 10px 0 6px; font-size: 26px; line-height: 1.2; color: #F8FAFC;">${heading}</h2>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #CBD5E1;">${intro}</p>
        </div>

        <div style="padding: 22px 24px;">
          <div style="margin-bottom: 14px; display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 999px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.28); color: #BAE6FD; font-size: 12px;">
            Workspace: <strong style="color: #E0F2FE; font-weight: 600;">${companyName}</strong>
          </div>

          <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.65; color: #CBD5E1;">${contextLine}</p>

          <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); color: #042f2e; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 8px 20px rgba(6,182,212,0.35);">
            ${buttonLabel}
          </a>

          <p style="margin: 22px 0 6px; color: #94A3B8; font-size: 12px;">If the button doesn’t work, you can copy and paste this access link:</p>
          <p style="margin: 0; font-size: 12px; color: #64748B; word-break: break-all;">${inviteLink}</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    subject,
    "",
    `Organization: ${companyName}`,
    intro,
    contextLine,
    "",
    `${buttonLabel}: ${inviteLink}`,
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
  workspaceName: string,
  tenantSlug: string,
  redirectTo: string,
  inviteeName?: string,
): Promise<{ sent: boolean; error?: string }> {
  const recipientName = inviteeName?.trim() || workspaceName;
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
        data: { name: recipientName, tenant_slug: tenantSlug },
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
      companyName: workspaceName,
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

  let upsertError: any = null;

  ({ error: upsertError } = await supabase.from("portal_users").upsert(
    {
      supabase_uid: supabaseUid,
      email,
      name: recipientName,
      role: "client",
      tenant_slug: tenantSlug,
      must_reset_password: false,
      invite_sent_at: nowIso,
      invite_accepted: false,
    },
    { onConflict: "email" },
  ));

  if (upsertError && (isMissingColumnError(upsertError, "invite_sent_at") || isMissingColumnError(upsertError, "invite_accepted"))) {
    // Backward-compatible fallback for schemas without invite tracking columns on portal_users
    const fallback = await supabase.from("portal_users").upsert(
      {
        supabase_uid: supabaseUid,
        email,
        name: recipientName,
        role: "client",
        tenant_slug: tenantSlug,
        must_reset_password: false,
      },
      { onConflict: "email" },
    );

    upsertError = fallback.error ?? null;
  }

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
  const acceptedUpdate = await supabase
    .from("portal_users")
    .update({ invite_accepted: true })
    .eq("email", email);

  if (acceptedUpdate.error && !isMissingColumnError(acceptedUpdate.error, "invite_accepted")) {
    console.warn("[markInviteAccepted] portal_users invite_accepted update failed", acceptedUpdate.error.message);
  }

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

const DOCUMENTS_METADATA_TABLE = "documents_metadata";

export async function getDocuments(
  slug: string,
  year?: number,
  month?: number,
  docType?: string,
): Promise<Document[]> {
  const tenantSlug = sanitizeTenantSlug(slug);

  let query = supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .select("*")
    .eq("tenant_slug", tenantSlug)
    .order("created_at", { ascending: false });

  if (year !== undefined) query = query.eq("year", year);
  if (month !== undefined) query = query.eq("month", month);
  if (docType && docType !== "All Types") query = query.eq("doc_type", docType);

  const { data, error } = await query;
  if (error) {
    console.error(`[getDocuments] ${tenantSlug}:`, error.message);
    return [];
  }

  return (data || []) as Document[];
}

export async function getDocumentsByUploader(
  uploadedByUserId: string | number,
  year?: number,
  month?: number,
  docType?: string,
  tenantSlugs?: string[],
  options?: { tenantIsNullOnly?: boolean },
): Promise<Document[]> {
  const userId = String(uploadedByUserId);

  let query = supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .select("*")
    .eq("uploaded_by_user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.tenantIsNullOnly) {
    query = query.is("tenant_slug", null);
  } else if (tenantSlugs && tenantSlugs.length > 0) {
    query = query.in("tenant_slug", tenantSlugs.map((s) => sanitizeTenantSlug(s)));
  }

  if (year !== undefined) query = query.eq("year", year);
  if (month !== undefined) query = query.eq("month", month);
  if (docType && docType !== "All Types") query = query.eq("doc_type", docType);

  const { data, error } = await query;
  if (error) {
    console.error(`[getDocumentsByUploader] ${userId}:`, error.message);
    return [];
  }

  return (data || []) as Document[];
}

export async function insertDocument(
  slug: string | null,
  doc: Omit<Document, "id" | "tenant_slug" | "created_at" | "updated_at">,
): Promise<Document> {
  const tenantSlug = slug ? sanitizeTenantSlug(slug) : null;

  let resolvedOrganizationId = doc.organization_id != null ? String(doc.organization_id) : null;
  if (!resolvedOrganizationId && tenantSlug) {
    const tenant = await getTenantBySlug(tenantSlug);
    resolvedOrganizationId = tenant?.id != null ? String(tenant.id) : null;

    if (!resolvedOrganizationId) {
      console.warn("[insertDocument] organization_id unresolved; inserting null", {
        tenantSlug,
      });
    }
  }

  const insertPayload = {
    tenant_slug: tenantSlug,
    organization_id: resolvedOrganizationId,
    client_id: doc.client_id ?? null,
    name: doc.name,
    description: doc.description ?? null,
    doc_type: doc.doc_type ?? null,
    file_key: doc.file_key,
    file_url: doc.file_url ?? null,
    file_name: doc.file_name ?? null,
    file_size: doc.file_size ?? null,
    mime_type: doc.mime_type ?? null,
    year: doc.year ?? null,
    month: doc.month ?? null,
    uploaded_by_name: doc.uploaded_by_name ?? null,
    uploaded_by_user_id: doc.uploaded_by_user_id != null ? String(doc.uploaded_by_user_id) : null,
    updated_at: new Date().toISOString(),
  };

  console.info("[insertDocument] inserting documents_metadata row", {
    tenantSlug,
    resolvedOrganizationId,
    insertPayload,
    clientUsed: "server/supabase.ts::supabase(service-role)",
    serviceRoleKeyExists: Boolean(SUPABASE_SERVICE_KEY),
    serviceRoleKeyLooksValid: isLikelyServiceRoleKey(SUPABASE_SERVICE_KEY),
  });

  const { data, error } = await supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("[insertDocument] insert failed", {
      tenantSlug,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      clientUsed: "server/supabase.ts::supabase(service-role)",
      serviceRoleKeyExists: Boolean(SUPABASE_SERVICE_KEY),
      serviceRoleKeyLooksValid: isLikelyServiceRoleKey(SUPABASE_SERVICE_KEY),
    });

    const enrichedMessage = [
      error.message,
      error.code ? `code=${error.code}` : null,
      error.details ? `details=${error.details}` : null,
      error.hint ? `hint=${error.hint}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    throw new Error(enrichedMessage || "Unknown documents_metadata insert error");
  }
  return data as Document;
}

async function removeDocumentFiles(fileKeys: string[]): Promise<void> {
  const keys = fileKeys.filter((k) => typeof k === "string" && k.length > 0);
  if (keys.length === 0) return;

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "documents";
  const { error } = await supabase.storage.from(bucket).remove(keys);
  if (error) {
    throw new Error(`Failed to remove document file(s) from storage: ${error.message}`);
  }
}

export async function deleteDocuments(slug: string, ids: Array<string | number>): Promise<{ deleted: number }> {
  const tenantSlug = sanitizeTenantSlug(slug);
  const normalizedIds = ids.map((id) => String(id));

  if (normalizedIds.length === 0) return { deleted: 0 };

  const { data: rows, error: lookupError } = await supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .select("id, file_key")
    .eq("tenant_slug", tenantSlug)
    .in("id", normalizedIds);

  if (lookupError) throw new Error(lookupError.message);

  const foundRows = (rows || []) as Array<{ id: string; file_key: string | null }>;
  const foundIds = foundRows.map((r) => r.id);

  if (foundIds.length === 0) return { deleted: 0 };

  await removeDocumentFiles(foundRows.map((r) => r.file_key ?? ""));

  const { error: deleteError } = await supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .delete()
    .eq("tenant_slug", tenantSlug)
    .in("id", foundIds);

  if (deleteError) throw new Error(deleteError.message);

  return { deleted: foundIds.length };
}

export async function deleteDocument(slug: string, id: string | number): Promise<void> {
  await deleteDocuments(slug, [id]);
}

export async function updateDocumentType(
  slug: string,
  id: string | number,
  docType: string,
): Promise<Document> {
  const tenantSlug = sanitizeTenantSlug(slug);

  const { data, error } = await supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .update({ doc_type: docType, updated_at: new Date().toISOString() })
    .eq("tenant_slug", tenantSlug)
    .eq("id", String(id))
    .select("*")
    .single();

  if (error || !data) {
    console.error("[updateDocumentType] failed", {
      tenantSlug,
      id: String(id),
      docType,
      error: error?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    throw new Error(error?.message || "Failed to update document category");
  }

  return data as Document;
}

export async function backfillDocumentsOrganizationIds(): Promise<{
  found: number;
  updated: number;
  unmatchedTenantSlugs: string[];
}> {
  const { data: rows, error: rowsError } = await supabase
    .from(DOCUMENTS_METADATA_TABLE)
    .select("id, tenant_slug")
    .is("organization_id", null);

  if (rowsError) throw new Error(`backfillDocumentsOrganizationIds: ${rowsError.message}`);

  const pendingRows = (rows || []) as Array<{ id: string; tenant_slug: string | null }>;
  const found = pendingRows.length;

  if (found === 0) {
    console.info("[documents_metadata.backfill_org] no rows with null organization_id");
    return { found: 0, updated: 0, unmatchedTenantSlugs: [] };
  }

  const { data: tenants, error: tenantError } = await supabase
    .from("portal_tenants")
    .select("id, slug");

  if (tenantError) throw new Error(`backfillDocumentsOrganizationIds tenants lookup failed: ${tenantError.message}`);

  const tenantMap = new Map<string, string>();
  for (const t of (tenants || []) as Array<{ id: number | string; slug: string }>) {
    tenantMap.set(sanitizeTenantSlug(t.slug), String(t.id));
  }

  const idsByOrg = new Map<string, string[]>();
  const unmatched = new Set<string>();

  for (const row of pendingRows) {
    const rowSlug = sanitizeTenantSlug(row.tenant_slug);
    const orgId = tenantMap.get(rowSlug);

    if (!orgId) {
      unmatched.add(rowSlug || "(empty)");
      continue;
    }

    const list = idsByOrg.get(orgId) || [];
    list.push(String(row.id));
    idsByOrg.set(orgId, list);
  }

  let updated = 0;
  const groupedUpdates = Array.from(idsByOrg.entries());
  for (const [orgId, ids] of groupedUpdates) {
    const { data: updatedRows, error: updateError } = await supabase
      .from(DOCUMENTS_METADATA_TABLE)
      .update({ organization_id: orgId, updated_at: new Date().toISOString() })
      .in("id", ids)
      .is("organization_id", null)
      .select("id");

    if (updateError) {
      throw new Error(`backfillDocumentsOrganizationIds update failed for org ${orgId}: ${updateError.message}`);
    }

    updated += (updatedRows || []).length;
  }

  console.info("[documents_metadata.backfill_org] complete", {
    found,
    updated,
    unmatchedTenantSlugs: Array.from(unmatched),
  });

  if (unmatched.size > 0) {
    console.warn("[documents_metadata.backfill_org] unmatched tenant slugs", {
      unmatchedTenantSlugs: Array.from(unmatched),
    });
  }

  return {
    found,
    updated,
    unmatchedTenantSlugs: Array.from(unmatched),
  };
}

export async function migrateLegacyDocumentsToGlobal(slug: string): Promise<{ migrated: number; skipped: number }> {
  const tenantSlug = sanitizeTenantSlug(slug);
  const legacyTables = [`${tenantSlug}_documents_list`, `${tenantSlug}_documents`];

  let migrated = 0;
  let skipped = 0;

  for (const table of legacyTables) {
    const { data, error } = await supabase.from(table).select("*");
    if (error || !data || data.length === 0) continue;

    for (const row of data as Record<string, unknown>[]) {
      const insertPayload = {
        tenant_slug: tenantSlug,
        organization_id: null,
        client_id: null,
        name: (row.name as string) ?? "Untitled",
        description: (row.description as string | null) ?? null,
        doc_type: (row.doc_type as string | null) ?? null,
        file_key: (row.file_key as string) ?? "",
        file_url: (row.file_url as string | null) ?? null,
        file_name: (row.file_name as string | null) ?? null,
        file_size: (row.file_size as number | null) ?? null,
        mime_type: (row.mime_type as string | null) ?? null,
        year: (row.year as number | null) ?? null,
        month: (row.month as number | null) ?? null,
        uploaded_by_name: (row.uploaded_by_name as string | null) ?? null,
        uploaded_by_user_id: null,
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from(DOCUMENTS_METADATA_TABLE)
        .insert(insertPayload);

      if (insertError) {
        skipped += 1;
      } else {
        migrated += 1;
      }
    }
  }

  return { migrated, skipped };
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

const GLOBAL_CHAT_TABLE = "portal_chat_messages";

type PortalChatMessageRow = {
  id: number;
  tenant_slug: string;
  assignment_id: number | null;
  dm_key: string | null;
  organization_id: string | null;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_role: string | null;
  message_text: string | null;
  message_type: string;
  file_url: string | null;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  document_metadata_id: string | null;
  thread_id: number | null;
  parent_message_id: number | null;
  reply_count: number | null;
  reply_to_message_id: number | null;
  reply_to_sender_name: string | null;
  reply_to_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

function mapGlobalChatRowToChatMessage(row: PortalChatMessageRow): ChatMessage {
  const senderUserId = row.sender_user_id != null ? Number(row.sender_user_id) : null;
  return {
    id: Number(row.id),
    sender_user_id: Number.isFinite(senderUserId) ? senderUserId : null,
    sender_role: row.sender_role === "admin" ? "admin" : "client",
    sender_name: row.sender_name ?? "Unknown",
    sender: row.sender_name ?? "Unknown",
    role: row.sender_role ?? "client",
    message: row.message_text,
    read: false,
    file_key: row.file_key,
    file_url: row.file_url,
    file_name: row.file_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    archive_year: null,
    archive_month: null,
    portal_document_id: null,
    reply_to_message_id: row.reply_to_message_id ?? null,
    reply_to_sender_name: row.reply_to_sender_name ?? null,
    reply_to_message_preview: row.reply_to_message_preview ?? null,
    thread_id: row.thread_id ?? row.parent_message_id ?? null,
    reply_count: row.reply_count ?? 0,
    created_at: row.created_at,
  };
}

export async function getGlobalChatMessages(
  slug: string,
  limit = 200,
  beforeId?: number,
  search?: string,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<ChatMessage[]> {
  const tenantSlug = sanitizeTenantSlug(slug);

  let query = supabase
    .from(GLOBAL_CHAT_TABLE)
    .select("*");

  if (dmKey) {
    query = query.eq("dm_key", dmKey);
  } else {
    query = query.eq("tenant_slug", tenantSlug).is("dm_key", null);
  }

  query = query
    .in("message_type", ["text", "file", "attachment"])
    .is("thread_id", null)
    .order("id", { ascending: false })
    .limit(limit);

  if (!dmKey) {
    if (!dmKey) {
      if (assignmentId != null) {
        query = query.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        query = query.is("assignment_id", null);
      }
    }
  }

  if (beforeId !== undefined) {
    query = query.lt("id", beforeId);
  }

  if (search && search.trim()) {
    const q = search.trim().replace(/,/g, " ");
    query = query.or(`message_text.ilike.%${q}%,file_name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[getGlobalChatMessages] query failed", {
      tenantSlug,
      limit,
      beforeId,
      search,
      error: error.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    throw new Error(error.message);
  }

  const rows = (data || []) as PortalChatMessageRow[];
  return rows.reverse().map(mapGlobalChatRowToChatMessage);
}

async function insertGlobalChatMessage(payload: Record<string, unknown>, label: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from(GLOBAL_CHAT_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    console.error(`[${label}] insert failed`, {
      payload,
      error: error?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    throw new Error(error?.message || `Failed to insert ${label}`);
  }

  return mapGlobalChatRowToChatMessage(data as PortalChatMessageRow);
}

export async function insertGlobalChatTextMessage(input: {
  tenant_slug: string;
  assignment_id?: number | null;
  dm_key?: string | null;
  organization_id: string | null;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_role: string | null;
  message_text: string;
  thread_id?: number | null;
  parent_message_id?: number | null;
  reply_count?: number | null;
  reply_to_message_id?: number | null;
  reply_to_sender_name?: string | null;
  reply_to_message_preview?: string | null;
}): Promise<ChatMessage> {
  const payload = {
    tenant_slug: sanitizeTenantSlug(input.tenant_slug),
    assignment_id: input.assignment_id ?? null,
    dm_key: input.dm_key ?? null,
    organization_id: input.organization_id,
    sender_user_id: input.sender_user_id,
    sender_name: input.sender_name,
    sender_role: input.sender_role,
    message_text: input.message_text,
    message_type: "text",
    thread_id: input.thread_id ?? input.parent_message_id ?? null,
    parent_message_id: input.parent_message_id ?? input.thread_id ?? null,
    reply_count: input.reply_count ?? 0,
    file_url: null,
    file_key: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    document_metadata_id: null,
    reply_to_message_id: input.reply_to_message_id ?? null,
    reply_to_sender_name: input.reply_to_sender_name ?? null,
    reply_to_message_preview: input.reply_to_message_preview ?? null,
  };

  return insertGlobalChatMessage(payload, "insertGlobalChatTextMessage");
}

export async function insertGlobalChatFileMessage(input: {
  tenant_slug: string;
  assignment_id?: number | null;
  dm_key?: string | null;
  organization_id: string | null;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_role: string | null;
  message_text: string | null;
  file_url: string;
  file_key: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  document_metadata_id: string | null;
  message_type?: "file" | "attachment";
  thread_id?: number | null;
  parent_message_id?: number | null;
  reply_count?: number | null;
  reply_to_message_id?: number | null;
  reply_to_sender_name?: string | null;
  reply_to_message_preview?: string | null;
}): Promise<ChatMessage> {
  const payload = {
    tenant_slug: sanitizeTenantSlug(input.tenant_slug),
    assignment_id: input.assignment_id ?? null,
    dm_key: input.dm_key ?? null,
    organization_id: input.organization_id,
    sender_user_id: input.sender_user_id,
    sender_name: input.sender_name,
    sender_role: input.sender_role,
    message_text: input.message_text,
    message_type: input.message_type ?? "file",
    thread_id: input.thread_id ?? input.parent_message_id ?? null,
    parent_message_id: input.parent_message_id ?? input.thread_id ?? null,
    reply_count: input.reply_count ?? 0,
    file_url: input.file_url,
    file_key: input.file_key,
    file_name: input.file_name,
    file_size: input.file_size,
    mime_type: input.mime_type,
    document_metadata_id: input.document_metadata_id,
    reply_to_message_id: input.reply_to_message_id ?? null,
    reply_to_sender_name: input.reply_to_sender_name ?? null,
    reply_to_message_preview: input.reply_to_message_preview ?? null,
  };

  return insertGlobalChatMessage(payload, "insertGlobalChatFileMessage");
}

export async function getChatMessages(
  slug: string,
  limit = 200,
  beforeId?: number,
  search?: string,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<ChatMessage[]> {
  const tenantSlug = sanitizeTenantSlug(slug);

  try {
    const globalMessages = await getGlobalChatMessages(tenantSlug, limit, beforeId, search, assignmentId, assignmentNullOnly, dmKey);
    if (globalMessages.length > 0) return globalMessages;
  } catch (error) {
    console.error("[getChatMessages] global chat query failed; attempting legacy fallback", {
      tenantSlug,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Legacy fallback is only for unscoped chat reads. Assignment-scoped conversations are global-only.
  if (dmKey || assignmentId != null || assignmentNullOnly) return [];

  // Legacy fallback: only fetch top-level messages (thread_id IS NULL) from tenant-specific table
  let query = supabase
    .from(`${tenantSlug}_chat`)
    .select("*")
    .is("thread_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!dmKey) {
    if (!dmKey) {
      if (assignmentId != null) {
        query = query.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        query = query.is("assignment_id", null);
      }
    }
  }

  if (beforeId !== undefined) {
    query = query.lt("id", beforeId);
  }

  if (search && search.trim()) {
    query = query.ilike("message", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    const code = (error as any)?.code;
    if (code !== "42P01") {
      console.error("[getChatMessages] legacy fallback query failed", {
        tenantSlug,
        error: error.message,
        code,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
    }
    return [];
  }

  // Return oldest-first for display
  return ((data || []) as ChatMessage[]).reverse();
}

export async function getThreadReplies(
  slug: string,
  parentId: number,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<ChatMessage[]> {
  const tenantSlug = sanitizeTenantSlug(slug);

  try {
    let query = supabase
      .from(GLOBAL_CHAT_TABLE)
      .select("*")
      .or(`thread_id.eq.${parentId},parent_message_id.eq.${parentId}`);

    if (dmKey) {
      query = query.eq("dm_key", dmKey);
    } else {
      query = query.eq("tenant_slug", tenantSlug);
    }

    query = query.order("created_at", { ascending: true });

    if (!dmKey) {
      if (assignmentId != null) {
        query = query.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        query = query.is("assignment_id", null);
      }
    }

    const { data, error } = await query;

    if (!error && data) {
      const rows = (data || []) as PortalChatMessageRow[];
      if (rows.length > 0) return rows.map(mapGlobalChatRowToChatMessage);
    }

    if (error) {
      console.warn("[getThreadReplies] global query failed; falling back to legacy", {
        tenantSlug,
        parentId,
        error: error.message,
        code: (error as any)?.code,
      });
    }
  } catch (err) {
    console.warn("[getThreadReplies] global query threw; falling back to legacy", {
      tenantSlug,
      parentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (dmKey || assignmentId != null || assignmentNullOnly) return [];

  const { data, error } = await supabase
    .from(`${tenantSlug}_chat`)
    .select("*")
    .eq("thread_id", parentId)
    .order("created_at", { ascending: true });
  if (error) {
    const code = (error as any)?.code;
    if (code !== "42P01") {
      console.warn("[getThreadReplies] legacy fallback query failed", {
        tenantSlug,
        parentId,
        error: error.message,
        code,
      });
    }
    return [];
  }
  return (data || []) as ChatMessage[];
}

export async function incrementReplyCount(
  slug: string,
  parentId: number,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<void> {
  const tenantSlug = sanitizeTenantSlug(slug);

  try {
    let readQuery = supabase
      .from(GLOBAL_CHAT_TABLE)
      .select("reply_count")
      .eq("id", parentId);

    if (dmKey) {
      readQuery = readQuery.eq("dm_key", dmKey);
    } else {
      readQuery = readQuery.eq("tenant_slug", tenantSlug);
    }

    if (!dmKey) {
      if (assignmentId != null) {
        readQuery = readQuery.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        readQuery = readQuery.is("assignment_id", null);
      }
    }

    const { data: globalRow, error: globalReadErr } = await readQuery.maybeSingle();

    if (!globalReadErr && globalRow) {
      const current = Number((globalRow as any)?.reply_count ?? 0);
      let updateQuery = supabase
        .from(GLOBAL_CHAT_TABLE)
        .update({ reply_count: Math.max(0, current + 1) })
        .eq("id", parentId);

      if (dmKey) {
        updateQuery = updateQuery.eq("dm_key", dmKey);
      } else {
        updateQuery = updateQuery.eq("tenant_slug", tenantSlug);
      }

      if (!dmKey) {
        if (assignmentId != null) {
        updateQuery = updateQuery.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        updateQuery = updateQuery.is("assignment_id", null);
      }
      }

      const { error: globalUpdateErr } = await updateQuery;
      if (!globalUpdateErr) return;
    }
  } catch {
    // fall through to legacy
  }

  // Legacy fallback for unscoped reads only
  if (dmKey || assignmentId != null || assignmentNullOnly) return;

  const { data: row } = await supabase
    .from(`${tenantSlug}_chat`)
    .select("reply_count")
    .eq("id", parentId)
    .single();

  const current = Number((row as any)?.reply_count ?? 0);

  await supabase
    .from(`${tenantSlug}_chat`)
    .update({ reply_count: Math.max(0, current + 1) })
    .eq("id", parentId);
}

export async function insertChatMessageSupabase(
  slug: string,
  msg: Omit<ChatMessage, "id" | "created_at">
): Promise<ChatMessage> {
  const tableName = `${slug}_chat`;

  const basePayload = {
    sender_user_id: msg.sender_user_id ?? null,
    sender_name: msg.sender_name,
    sender_role: msg.sender_role,
    sender: msg.sender_name,
    role: msg.sender_role,
    message: msg.message ?? null,
    read: msg.read,
    file_key: msg.file_key ?? null,
    file_url: msg.file_url ?? null,
    file_name: msg.file_name ?? null,
    file_size: msg.file_size ?? null,
    mime_type: msg.mime_type ?? null,
    archive_year: msg.archive_year ?? null,
    archive_month: msg.archive_month ?? null,
    portal_document_id: msg.portal_document_id ?? null,
    thread_id: msg.thread_id ?? null,
    reply_count: msg.reply_count ?? 0,
  } as Record<string, unknown>;

  const attemptInsert = async (payload: Record<string, unknown>, label: string) => {
    const { data, error } = await supabase.from(tableName).insert(payload).select().single();
    if (error) {
      const rawError = JSON.stringify(error, null, 2);
      console.error(`[insertChatMessageSupabase] ${label} raw error`, rawError);
      console.error("[insertChatMessageSupabase] insert context", {
        tableName,
        tenantSlug: slug,
        payload,
        file_url: payload.file_url ?? null,
        file_name: payload.file_name ?? null,
        file_key: payload.file_key ?? null,
        portal_document_id: payload.portal_document_id ?? null,
        portal_document_id_type: typeof payload.portal_document_id,
      });

      const formatted = [
        (error as any)?.message,
        (error as any)?.details,
        (error as any)?.hint,
        (error as any)?.code,
      ]
        .filter(Boolean)
        .join(" | ");

      const fallbackString = String((error as any)?.message ?? "").trim();
      throw new Error(formatted || fallbackString || rawError || "Unknown chat insert error");
    }

    return data as ChatMessage;
  };

  try {
    return await attemptInsert(basePayload, "primary insert");
  } catch (primaryErr) {
    const detail = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    // Fallback for legacy tenant chat schemas that still use sender/role but do not have sender_name/sender_role/read/etc
    const legacyPayload = {
      sender: msg.sender_name,
      role: msg.sender_role,
      message: msg.message ?? null,
      file_key: msg.file_key ?? null,
      file_url: msg.file_url ?? null,
      file_name: msg.file_name ?? null,
      file_size: msg.file_size ?? null,
      mime_type: msg.mime_type ?? null,
      archive_year: msg.archive_year ?? null,
      archive_month: msg.archive_month ?? null,
      portal_document_id: msg.portal_document_id ?? null,
      thread_id: msg.thread_id ?? null,
      reply_count: msg.reply_count ?? 0,
    } as Record<string, unknown>;

    try {
      console.warn("[insertChatMessageSupabase] primary failed, retrying with legacy payload", {
        tableName,
        tenantSlug: slug,
        detail,
      });
      return await attemptInsert(legacyPayload, "legacy fallback insert");
    } catch (legacyErr) {
      const legacyDetail = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      throw new Error(`Primary: ${detail}. Legacy fallback: ${legacyDetail}`);
    }
  }
}

export async function getGlobalChatMessageById(
  slug: string,
  id: number,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<PortalChatMessageRow | null> {
  const tenantSlug = sanitizeTenantSlug(slug);
  let query = supabase
    .from(GLOBAL_CHAT_TABLE)
    .select("*")
    .eq("id", id);

  if (dmKey) {
    query = query.eq("dm_key", dmKey);
  } else {
    query = query.eq("tenant_slug", tenantSlug).is("dm_key", null);
  }

  if (!dmKey) {
    if (!dmKey) {
      if (assignmentId != null) {
        query = query.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        query = query.is("assignment_id", null);
      }
    }
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as PortalChatMessageRow | null) ?? null;
}

export async function decrementReplyCount(
  slug: string,
  parentId: number,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<void> {
  const tenantSlug = sanitizeTenantSlug(slug);

  try {
    let readQuery = supabase
      .from(GLOBAL_CHAT_TABLE)
      .select("reply_count")
      .eq("id", parentId);

    if (dmKey) {
      readQuery = readQuery.eq("dm_key", dmKey);
    } else {
      readQuery = readQuery.eq("tenant_slug", tenantSlug);
    }

    if (!dmKey) {
      if (assignmentId != null) {
        readQuery = readQuery.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        readQuery = readQuery.is("assignment_id", null);
      }
    }

    const { data: globalRow, error: globalReadErr } = await readQuery.maybeSingle();

    if (!globalReadErr && globalRow) {
      const current = Math.max(0, Number((globalRow as any)?.reply_count ?? 0));
      const next = Math.max(0, current - 1);

      let updateQuery = supabase
        .from(GLOBAL_CHAT_TABLE)
        .update({ reply_count: next })
        .eq("id", parentId);

      if (dmKey) {
        updateQuery = updateQuery.eq("dm_key", dmKey);
      } else {
        updateQuery = updateQuery.eq("tenant_slug", tenantSlug);
      }

      if (!dmKey) {
        if (assignmentId != null) {
        updateQuery = updateQuery.eq("assignment_id", assignmentId);
      } else if (assignmentNullOnly) {
        updateQuery = updateQuery.is("assignment_id", null);
      }
      }

      const { error: globalUpdateErr } = await updateQuery;
      if (!globalUpdateErr) return;
    }
  } catch {
    // fall through to legacy
  }

  // Legacy fallback for unscoped reads only
  if (dmKey || assignmentId != null || assignmentNullOnly) return;

  const { data: row } = await supabase
    .from(`${tenantSlug}_chat`)
    .select("reply_count")
    .eq("id", parentId)
    .single();

  const current = Math.max(0, Number((row as any)?.reply_count ?? 0));

  await supabase
    .from(`${tenantSlug}_chat`)
    .update({ reply_count: Math.max(0, current - 1) })
    .eq("id", parentId);
}

export async function deleteGlobalChatMessage(
  slug: string,
  id: number,
  assignmentId?: number | null,
  assignmentNullOnly = false,
  dmKey?: string | null,
): Promise<{ deleted: boolean; parentId: number | null; cascadeDeleted: number }> {
  const tenantSlug = sanitizeTenantSlug(slug);

  let targetQuery = supabase
    .from(GLOBAL_CHAT_TABLE)
    .select("id, thread_id, parent_message_id, assignment_id")
    .eq("id", id);

  if (dmKey) {
    targetQuery = targetQuery.eq("dm_key", dmKey);
  } else {
    targetQuery = targetQuery.eq("tenant_slug", tenantSlug);
    if (assignmentId != null) {
      targetQuery = targetQuery.eq("assignment_id", assignmentId);
    } else if (assignmentNullOnly) {
      targetQuery = targetQuery.is("assignment_id", null);
    }
  }

  const { data: target, error: targetErr } = await targetQuery.maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!target) return { deleted: false, parentId: null, cascadeDeleted: 0 };

  const parentId = (target as any)?.thread_id ?? (target as any)?.parent_message_id ?? null;
  const targetAssignmentId = (target as any)?.assignment_id ?? null;

  // If deleting a parent message, cascade delete global thread replies for that parent.
  let cascadeDeleted = 0;
  if (parentId == null) {
    let childrenQuery = supabase
      .from(GLOBAL_CHAT_TABLE)
      .select("id")
      .or(`thread_id.eq.${id},parent_message_id.eq.${id}`);

    if (dmKey) {
      childrenQuery = childrenQuery.eq("dm_key", dmKey);
    } else {
      childrenQuery = childrenQuery.eq("tenant_slug", tenantSlug).eq("assignment_id", targetAssignmentId);
    }

    const { data: children, error: childrenErr } = await childrenQuery;
    if (childrenErr) throw new Error(childrenErr.message);

    const childIds = (children || []).map((r: any) => r.id).filter((v: any) => Number.isFinite(Number(v)));
    if (childIds.length > 0) {
      let delChildren = supabase.from(GLOBAL_CHAT_TABLE).delete().in("id", childIds);
      if (dmKey) {
        delChildren = delChildren.eq("dm_key", dmKey);
      } else {
        delChildren = delChildren.eq("tenant_slug", tenantSlug).eq("assignment_id", targetAssignmentId);
      }
      const { error: delChildrenErr } = await delChildren;
      if (delChildrenErr) throw new Error(delChildrenErr.message);
      cascadeDeleted = childIds.length;
    }
  }

  let delQuery = supabase.from(GLOBAL_CHAT_TABLE).delete().eq("id", id);
  if (dmKey) {
    delQuery = delQuery.eq("dm_key", dmKey);
  } else {
    delQuery = delQuery.eq("tenant_slug", tenantSlug);
    if (assignmentId != null) {
      delQuery = delQuery.eq("assignment_id", assignmentId);
    } else if (assignmentNullOnly) {
      delQuery = delQuery.is("assignment_id", null);
    }
  }

  const { error: delErr } = await delQuery;
  if (delErr) throw new Error(delErr.message);

  return { deleted: true, parentId, cascadeDeleted };
}

export async function deleteChatMessageSupabase(
  slug: string,
  id: number
): Promise<void> {
  const tenantSlug = sanitizeTenantSlug(slug);
  const { error } = await supabase.from(`${tenantSlug}_chat`).delete().eq("id", id);

  if (error) {
    const code = (error as any)?.code;
    // Missing legacy table should fail gracefully now.
    if (code === "42P01") return;
    throw new Error(error.message);
  }
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

export async function listTenantMembers(tenantSlug: string): Promise<TenantMember[]> {
  const safeSlug = sanitizeTenantSlug(tenantSlug);

  type TenantUserSelectRow = {
    id: number | string;
    email: string | null;
    name: string | null;
    role: UserRole | null;
    tenant_slug: string | null;
    invite_sent_at?: string | null;
    invite_accepted?: boolean | null;
  };

  // 1) Direct tenant-linked members (client users and any explicitly tenant-bound users)
  const withInviteUsers = await supabase
    .from("portal_users")
    .select("id,email,name,role,tenant_slug,invite_sent_at,invite_accepted")
    .eq("tenant_slug", safeSlug)
    .order("created_at", { ascending: true });

  const usersResult =
    withInviteUsers.error &&
    (isMissingColumnError(withInviteUsers.error, "invite_sent_at") ||
      isMissingColumnError(withInviteUsers.error, "invite_accepted"))
      ? await supabase
          .from("portal_users")
          .select("id,email,name,role,tenant_slug")
          .eq("tenant_slug", safeSlug)
          .order("created_at", { ascending: true })
      : withInviteUsers;

  if (usersResult.error) {
    throw new Error(`listTenantMembers.portal_users: ${usersResult.error.message}`);
  }

  // 2) Staff assignments for this tenant (query IDs first to avoid FK-join dependency issues)
  const assignments = await supabase
    .from("staff_client_assignments")
    .select("staff_id")
    .eq("tenant_slug", safeSlug);

  if (assignments.error) {
    throw new Error(`listTenantMembers.staff_client_assignments: ${assignments.error.message}`);
  }

  const staffIds = Array.from(
    new Set(
      ((assignments.data ?? []) as Array<{ staff_id: number | null }>).map((r) => Number(r.staff_id ?? 0)).filter((id) => id > 0)
    )
  );

  let assignedStaffUsers: TenantUserSelectRow[] = [];
  if (staffIds.length > 0) {
    const withInviteStaff = await supabase
      .from("portal_users")
      .select("id,email,name,role,tenant_slug,invite_sent_at,invite_accepted")
      .in("id", staffIds);

    const staffResult =
      withInviteStaff.error &&
      (isMissingColumnError(withInviteStaff.error, "invite_sent_at") ||
        isMissingColumnError(withInviteStaff.error, "invite_accepted"))
        ? await supabase
            .from("portal_users")
            .select("id,email,name,role,tenant_slug")
            .in("id", staffIds)
        : withInviteStaff;

    if (staffResult.error) {
      throw new Error(`listTenantMembers.assigned_staff_users: ${staffResult.error.message}`);
    }

    assignedStaffUsers = (staffResult.data ?? []) as unknown as TenantUserSelectRow[];
  }

  const tenantUsers = (usersResult.data ?? []) as unknown as TenantUserSelectRow[];
  const map = new Map<number, TenantMember>();

  for (const u of tenantUsers) {
    const id = Number(u.id ?? 0);
    if (!id) continue;
    map.set(id, {
      id,
      email: String(u.email ?? ""),
      name: u.name ?? null,
      role: (u.role ?? "client") as UserRole,
      tenant_slug: u.tenant_slug ?? null,
      invite_sent_at: u.invite_sent_at ?? null,
      invite_accepted: Boolean(u.invite_accepted),
      source: "tenant_user",
    });
  }

  for (const u of assignedStaffUsers) {
    const id = Number(u.id ?? 0);
    if (!id) continue;
    if (map.has(id)) continue;

    map.set(id, {
      id,
      email: String(u.email ?? ""),
      name: u.name ?? null,
      role: (u.role ?? "accountant") as UserRole,
      tenant_slug: safeSlug,
      invite_sent_at: u.invite_sent_at ?? null,
      invite_accepted: Boolean(u.invite_accepted),
      source: "staff_assignment",
    });
  }

  return Array.from(map.values());
}

export async function upsertTenantMember(params: {
  tenantSlug: string;
  fullName: string;
  email: string;
  title?: string;
  portalOrigin?: string;
}): Promise<{ member: PortalUser; invited: boolean; inviteError?: string }> {
  const safeSlug = sanitizeTenantSlug(params.tenantSlug);
  const normalizedEmail = params.email.trim().toLowerCase();

  const existing = await getPortalUserByEmail(normalizedEmail);

  // Business member invites are always client-scoped members.
  const member = await upsertPortalUser({
    email: normalizedEmail,
    name: params.fullName,
    role: "client",
    tenant_slug: safeSlug,
    must_reset_password: existing?.must_reset_password ?? true,
  });

  if (!member) throw new Error("Failed to upsert member");

  // Invite is always sent on submit for this UX flow.
  const redirectTo = getInviteRedirectTo(params.portalOrigin);
  const tenant = await getTenantBySlug(safeSlug);
  const workspaceName = tenant?.company_name ?? safeSlug;
  const invite = await inviteClientByEmail(normalizedEmail, workspaceName, safeSlug, redirectTo, params.fullName);

  return {
    member,
    invited: invite.sent,
    inviteError: invite.sent ? undefined : invite.error ?? "Invite failed",
  };
}

export async function resendTenantMemberInvite(params: {
  tenantSlug: string;
  email: string;
  fullName?: string | null;
  portalOrigin?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const safeSlug = sanitizeTenantSlug(params.tenantSlug);
  const redirectTo = getInviteRedirectTo(params.portalOrigin);
  const tenant = await getTenantBySlug(safeSlug);
  const workspaceName = tenant?.company_name ?? safeSlug;
  return inviteClientByEmail(
    params.email.trim().toLowerCase(),
    workspaceName,
    safeSlug,
    redirectTo,
    params.fullName ?? params.email,
  );
}

export async function removeTenantMember(params: {
  tenantSlug: string;
  memberId: number;
}): Promise<void> {
  const safeSlug = sanitizeTenantSlug(params.tenantSlug);
  const { data: member, error } = await supabase
    .from("portal_users")
    .select("id, role, tenant_slug")
    .eq("id", params.memberId)
    .single();

  if (error || !member) throw new Error(`removeTenantMember: member not found`);

  if ((member.role as UserRole) === "client") {
    // Safe MVP behavior: detach client account from this tenant so they no longer appear/access it.
    const { error: detachErr } = await supabase
      .from("portal_users")
      .update({ tenant_slug: null })
      .eq("id", params.memberId);
    if (detachErr) throw new Error(`removeTenantMember.detachClient: ${detachErr.message}`);
    return;
  }

  await unassignStaffFromClient(params.memberId, safeSlug);
}
