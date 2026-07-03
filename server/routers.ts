import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { CLIENT_WORKSPACE_COOKIE } from "./auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { PACKAGE_TIERS, TAB_ACCESS, PACKAGE_LABELS, type PackageTier } from "../shared/tiers";
import {
  getTeamMembersDb,
  addTeamMemberDb,
  deleteTeamMemberDb,
  getFocusAreasDb,
  addFocusAreaDb,
  deleteFocusAreaDb,
  getTaskCategoriesDb,
  addTaskCategoryDb,
  deleteTaskCategoryDb,
  updateTaskCategoryMetaDb,
  getCategoryIntelligenceDb,
  upsertCategoryIntelligenceDb,
  getTimeLogs as getTimeLogsDb,
  getTimeLogsByYear as getTimeLogsByYearDb,
  insertTimeLog as insertTimeLogDb,
  deleteTimeLog as deleteTimeLogDb,
} from "./db";
import {
  getAllPortalTenants,
  getClientRoster,
  getPortalUserByEmail,
  upsertPortalUser,
  getCoachingItems,
  getDocuments,
  getDocumentsByUploader,
  insertDocument,
  deleteDocument,
  deleteDocuments,
  updateDocumentType,
  updateDocumentDate,
  updateDocumentFileName,
  deleteDocumentsByUploader,
  listDocumentFolders,
  createDocumentFolder,
  getFinancials,
  getKpiMetrics,
  getLineItems,
  getSalesTracker,
  getSalesTrackerByYear,
  getTenantBySlug,
  getTimeLogs,
  getTimeLogsByYear,
  getTeamMembers,
  addTeamMember,
  deleteTeamMember,
  getFocusAreas,
  addFocusArea,
  deleteFocusArea,
  upsertClientRosterEntry,
  deleteClientRosterEntry,
  insertCoachingItem,
  insertLineItem,
  insertTimeLog,
  supabase,
  toggleCoachingItem,
  deleteCoachingItem,
  upsertFinancial,
  updateFinancialSummary,
  upsertKpiMetric,
  upsertPortalTenant,
  provisionTenant,
  upsertSalesTracker,
  getCoachingNote,
  upsertCoachingNote,
  getLineItemsByYear,
  getChatMessages,
  getChatUnreadCount,
  upsertChatReadState,
  listDmConversationsForUser,
  getThreadReplies,
  incrementReplyCount,
  decrementReplyCount,
  insertChatMessageSupabase,
  insertGlobalChatTextMessage,
  insertGlobalChatFileMessage,
  getGlobalChatMessageById,
  deleteGlobalChatMessage,
  deleteChatMessageSupabase,
  type PortalUser,
  type StaffRole,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  listStaff,
  createStaffMember,
  updateStaffMember,
  removeStaffMember,
  getStaffAssignments,
  assignStaffToClient,
  unassignStaffFromClient,
  listTenantMembers,
  upsertTenantMember,
  resendTenantMemberInvite,
  removeTenantMember,
  inviteClientByEmail,
  markInviteAccepted,
  archiveTenant,
  restoreTenant,
  deleteTenant,
  sanitizeTenantSlug,
  backfillDocumentsOrganizationIds,
  insertActivityLog,
  listActivityLogs,
  getDocumentFolderById,
  countDocumentsInFolderPath,
  deleteDocumentFolderById,
  listClientMeetings,
  getClientMeetingById,
  listClientMeetingActionItems,
  insertClientMeeting,
  updateClientMeeting,
  deleteClientMeeting,
  replaceClientMeetingActionItems,
  updateClientMeetingActionItemStatus,
  listCoachingNextSteps,
  createCoachingNextStep,
  updateCoachingNextStep,
  deleteCoachingNextStep,
  type CoachingNextStepStatus,
  type CoachingNextStepPriority,
  type WorkspaceNote,
  type WorkspaceNoteCategory,
  type WorkspaceNoteComment,
  listWorkspaceNotes,
  getWorkspaceNoteById,
  createWorkspaceNote,
  updateWorkspaceNote,
  setWorkspaceNotePinned,
  setWorkspaceNoteArchived,
  softDeleteWorkspaceNote,
  listWorkspaceNoteComments,
  getWorkspaceNoteCommentById,
  createWorkspaceNoteComment,
  updateWorkspaceNoteComment,
  softDeleteWorkspaceNoteComment,
  countWorkspaceNoteCommentsByNoteIds,
  listClientWorkspaceAccessByUserId,
  getClientWorkspaceAccessByUserAndTenant,
  upsertClientWorkspaceAccess,
  type ClientMeetingMode,
} from "./supabase";

// ─── Invite redirect helpers ─────────────────────────────────────────────────
const PROD_PORTAL_ORIGIN = "https://portal.kynliconsulting.com";
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

function getInviteRedirectTo(portalOrigin?: string): string {
  const explicit = (portalOrigin && portalOrigin.trim()) || "";
  const envOrigin = (
    process.env.PORTAL_ORIGIN ||
    process.env.PUBLIC_PORTAL_ORIGIN ||
    process.env.APP_URL ||
    ""
  ).trim();

  // Prefer explicit/browser origin, then env origin, then hard production default.
  // This avoids accidental localhost fallback in misconfigured production NODE_ENV.
  const origin = explicit || envOrigin || PROD_PORTAL_ORIGIN;
  return `${origin.replace(/\/$/, "")}/auth/callback`;
}

function sanitizeStorageFileName(rawName: string | undefined, fallbackExt: string): string {
  const raw = (rawName && rawName.trim()) || `document.${fallbackExt}`;

  // Remove path separators/controls and normalize unicode.
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  const lastDot = normalized.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < normalized.length - 1;

  const base = hasExt ? normalized.slice(0, lastDot) : normalized;
  const extRaw = hasExt ? normalized.slice(lastDot + 1) : fallbackExt;

  const safeBase = base
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "") || "file";

  const safeExt = (extRaw || fallbackExt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") || fallbackExt;

  return `${safeBase}.${safeExt}`;
}

function fileExtFromName(name?: string | null): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const last = raw.replace(/[\\/]/g, "/").split("/").pop() || "";
  const idx = last.lastIndexOf(".");
  if (idx <= 0) return "";
  return last.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAllowedVideoFile(input: { fileName?: string | null; mimeType?: string | null }): { ok: boolean; ext: string } {
  const ext = fileExtFromName(input.fileName);
  const mime = String(input.mimeType || "").toLowerCase().trim();

  const extAllowed = !!ext && ALLOWED_VIDEO_EXTENSIONS.has(ext);
  if (!extAllowed) return { ok: false, ext: ext || "mp4" };

  if (!mime) return { ok: false, ext: ext || "mp4" };
  if (VIDEO_MIME_DENYLIST.has(mime)) return { ok: false, ext: ext || "mp4" };

  const byExt = VIDEO_MIME_BY_EXTENSION[ext] ?? new Set<string>();
  const mimeAllowed = byExt.has(mime) || mime.startsWith("video/");

  return { ok: mimeAllowed, ext: ext || "mp4" };
}

function buildDirectVideoStoragePath(args: {
  tenantSlug: string | null;
  userId: number;
  docType: string;
  year: number;
  month?: number | null;
  fileName: string;
  ext: string;
}): string {
  const safeDocType = (args.docType || "other").toLowerCase().replace(/[^a-z0-9]/g, "-") || "other";
  const safeYear = Number.isFinite(args.year) ? String(args.year) : "unknown_year";
  const safeMonth = args.month && Number.isFinite(args.month)
    ? String(args.month).padStart(2, "0")
    : "00";
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2);
  const sanitizedFileName = sanitizeStorageFileName(args.fileName, args.ext);
  const storagePrefix = args.tenantSlug ?? `staff/${String(args.userId || "unknown")}`;
  return `${storagePrefix}/${safeDocType}/${safeYear}/${safeMonth}/${timestamp}-${rand}-${sanitizedFileName}`;
}

// ─── Admin guard middleware ───────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Tenant context helper ────────────────────────────────────────────────────
const STAFF_PORTAL_ROLES = new Set<PortalUser["role"]>([
  "accounting_manager",
  "tax_manager",
  "accountant",
]);
const INTERNAL_CHAT_TENANT_SLUG = "kynli_internal";
const N8N_MENTION_NOTIFICATION_WEBHOOK_URL = process.env.N8N_MENTION_NOTIFICATION_WEBHOOK_URL?.trim() || "";
const N8N_DOCUMENT_MOVED_WEBHOOK_URL = process.env.N8N_DOCUMENT_MOVED_WEBHOOK_URL?.trim() || "https://n8n.automatenow.live/webhook/movedfile";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "documents";
const MAX_VIDEO_UPLOAD_BYTES = 250 * 1024 * 1024;
const ALLOWED_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const VIDEO_MIME_BY_EXTENSION: Record<string, Set<string>> = {
  mp4: new Set(["video/mp4", "application/mp4"]),
  mov: new Set(["video/quicktime", "video/mp4", "application/octet-stream"]),
  m4v: new Set(["video/x-m4v", "video/mp4", "application/octet-stream"]),
  webm: new Set(["video/webm", "application/octet-stream"]),
  avi: new Set(["video/x-msvideo", "video/avi", "video/msvideo", "application/octet-stream"]),
  mkv: new Set(["video/x-matroska", "video/matroska", "application/octet-stream"]),
};
const VIDEO_MIME_DENYLIST = new Set([
  "text/html",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
  "application/x-sh",
  "application/x-executable",
  "application/x-dosexec",
]);

function inferActorType(role: PortalUser["role"]): string {
  if (role === "admin") return "admin";
  if (role === "accounting_manager" || role === "tax_manager" || role === "accountant") return "internal_staff";
  if (role === "client") return "client";
  return "external_member";
}

function extractRequestIp(req: any): string | null {
  const xff = req?.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0]!.trim();
  return req?.ip ?? req?.socket?.remoteAddress ?? null;
}

async function writeActivityLog(input: {
  req?: any;
  actor: PortalUser;
  action_type: string;
  entity_type: string;
  entity_id?: string | null;
  tenant_slug?: string | null;
  organization_id?: string | null;
  client_id?: string | null;
  file_name?: string | null;
  previous_value?: string | null;
  new_value?: string | null;
  metadata?: Record<string, unknown>;
  status?: "success" | "failed";
}): Promise<void> {
  await insertActivityLog({
    actor_user_id: Number(input.actor.id),
    actor_name: input.actor.name ?? null,
    actor_email: input.actor.email ?? null,
    actor_role: input.actor.role,
    actor_type: inferActorType(input.actor.role),
    action_type: input.action_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    tenant_slug: input.tenant_slug ?? null,
    organization_id: input.organization_id ?? null,
    client_id: input.client_id ?? null,
    file_name: input.file_name ?? null,
    previous_value: input.previous_value ?? null,
    new_value: input.new_value ?? null,
    metadata: input.metadata ?? {},
    ip_address: extractRequestIp(input.req),
    status: input.status ?? "success",
  });
}

const isInternalChatSlug = (slug?: string | null): boolean =>
  !!slug && sanitizeTenantSlug(slug) === sanitizeTenantSlug(INTERNAL_CHAT_TENANT_SLUG);

async function resolveChatTenantSlug(
  user: PortalUser,
  requestedSlug?: string,
  activeClientWorkspaceSlug?: string | null,
): Promise<string> {
  if (isInternalChatSlug(requestedSlug)) {
    if (STAFF_PORTAL_ROLES.has(user.role) || user.role === "admin") {
      return INTERNAL_CHAT_TENANT_SLUG;
    }
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal team chat is restricted." });
  }
  return resolveTenantSlug(user, requestedSlug, activeClientWorkspaceSlug);
}

async function getAssignedTenantSlugsForUser(user: PortalUser): Promise<string[]> {
  if (!STAFF_PORTAL_ROLES.has(user.role)) return [];
  const assignments = await getStaffAssignments(user.id);
  return Array.from(new Set(assignments.map((a) => sanitizeTenantSlug(a.tenant_slug)).filter(Boolean)));
}

async function resolveTenantSlugsForUser(
  user: PortalUser,
  requestedTenantSlug?: string,
  activeClientWorkspaceSlug?: string | null,
): Promise<string[]> {
  const requested = requestedTenantSlug ? sanitizeTenantSlug(requestedTenantSlug) : null;

  if (user.role === "admin") {
    if (requested) return [requested];
    // Admin without explicit tenant context should not accidentally hit all tenants on tenant-scoped routes.
    throw new TRPCError({ code: "BAD_REQUEST", message: "Admin tenant context required" });
  }

  // Staff/accountants are assignment-scoped even if tenant_slug is present on the user row.
  if (STAFF_PORTAL_ROLES.has(user.role)) {
    const assignedSlugs = await getAssignedTenantSlugsForUser(user);
    if (!assignedSlugs.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No assigned tenants found for this staff member" });
    }

    if (requested) {
      if (!assignedSlugs.includes(requested)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant is not assigned to this staff member." });
      }
      return [requested];
    }

    return assignedSlugs;
  }

  if (user.tenant_slug) {
    const own = sanitizeTenantSlug(user.tenant_slug);

    if (user.role === "client") {
      const workspaceRows = await listClientWorkspaceAccessByUserId(user.id);
      const accessible = workspaceRows.map((r) => sanitizeTenantSlug(r.tenant_slug)).filter(Boolean);

      const effectiveActive = activeClientWorkspaceSlug ? sanitizeTenantSlug(activeClientWorkspaceSlug) : null;

      if (requested) {
        if (!accessible.length) {
          if (requested !== own) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only access your own tenant." });
          }
          return [own];
        }
        if (!accessible.includes(requested)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace." });
        }
        return [requested];
      }

      if (accessible.length) {
        if (effectiveActive && accessible.includes(effectiveActive)) return [effectiveActive];
        const primary = workspaceRows.find((r) => r.is_primary) ?? workspaceRows[0];
        if (primary?.tenant_slug) return [sanitizeTenantSlug(primary.tenant_slug)];
      }

      return [own];
    }

    if (requested && requested !== own) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only access your own tenant." });
    }
    return [own];
  }

  throw new TRPCError({ code: "NOT_FOUND", message: "No tenant profile found for this user" });
}

async function resolveTenantSlug(user: PortalUser, impersonateSlug?: string, activeClientWorkspaceSlug?: string | null): Promise<string> {
  const slugs = await resolveTenantSlugsForUser(user, impersonateSlug, activeClientWorkspaceSlug);
  return slugs[0];
}

const INTERNAL_NOTES_ALLOWED_ROLES = new Set<PortalUser["role"]>([
  "admin",
  "accounting_manager",
  "tax_manager",
  "accountant",
]);

const MEETING_MODE_VALUES = ["client_meeting", "check_in_call"] as const;
const meetingModeSchema = z.enum(MEETING_MODE_VALUES);

function resolveMeetingMode(mode?: string | null): ClientMeetingMode {
  return mode === "check_in_call" ? "check_in_call" : "client_meeting";
}

const NEXT_STEP_STATUS_VALUES = ["not_started", "in_progress", "waiting", "blocked", "completed"] as const;
const nextStepStatusSchema = z.enum(NEXT_STEP_STATUS_VALUES);

const NEXT_STEP_PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;
const nextStepPrioritySchema = z.enum(NEXT_STEP_PRIORITY_VALUES);

function isStaffActor(user: PortalUser): boolean {
  return user.role !== "client";
}

type TimerWorkScope = "client" | "internal";

async function resolveTimerScope(
  ctx: { user: PortalUser; viewAsClientTenantSlug: string | null; clientWorkspaceTenantSlug?: string | null },
  requestedTenantSlug?: string,
): Promise<{ workScope: TimerWorkScope; tenantSlug: string | null }> {
  const rawViewAs = (ctx.viewAsClientTenantSlug || "").trim();
  const rawWorkspace = (ctx.clientWorkspaceTenantSlug || "").trim();
  const effectiveClientScopeSlug = rawViewAs || rawWorkspace || "";

  if (effectiveClientScopeSlug) {
    const slug = await resolveChatTenantSlug(
      ctx.user,
      requestedTenantSlug || effectiveClientScopeSlug,
      ctx.clientWorkspaceTenantSlug,
    );
    return { workScope: "client", tenantSlug: slug };
  }

  if (!isStaffActor(ctx.user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal time tracking is restricted to staff." });
  }

  return { workScope: "internal", tenantSlug: null };
}

type ResolvedNotesWorkspace = {
  tenantSlug: string;
  organizationId: string | null;
};

async function resolveActiveClientWorkspace(
  ctx: { user: PortalUser | null; viewAsClientTenantSlug: string | null; clientWorkspaceTenantSlug?: string | null },
): Promise<ResolvedNotesWorkspace> {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });

  const rawRequested = (ctx.viewAsClientTenantSlug ?? "").trim();
  if (!rawRequested) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are available only in View as Client mode." });
  }
  const requested = sanitizeTenantSlug(rawRequested);

  const slugs = await resolveTenantSlugsForUser(ctx.user, requested, ctx.clientWorkspaceTenantSlug);
  const tenantSlug = sanitizeTenantSlug(slugs[0]);

  const { data: tenantRow } = await supabase
    .from("portal_tenants")
    .select("organization_id")
    .eq("slug", tenantSlug)
    .maybeSingle();

  return {
    tenantSlug,
    organizationId: (tenantRow as { organization_id?: string | null } | null)?.organization_id ?? null,
  };
}

function assertCanAccessInternalNotes(ctx: { user: PortalUser | null }): void {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  if (!INTERNAL_NOTES_ALLOWED_ROLES.has(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are available to staff only." });
  }
}

async function assertNoteBelongsToWorkspace(noteId: string, tenantSlug: string): Promise<WorkspaceNote> {
  const note = await getWorkspaceNoteById({ noteId, tenant_slug: tenantSlug });
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found." });
  return note;
}

async function assertCommentBelongsToWorkspace(commentId: string, tenantSlug: string): Promise<WorkspaceNoteComment> {
  const comment = await getWorkspaceNoteCommentById({ comment_id: commentId, tenant_slug: tenantSlug });
  if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found." });
  return comment;
}

async function resolveChatAssignmentIdForUser(
  user: PortalUser,
  tenantSlug: string,
  requestedAssignmentId?: number,
): Promise<{ assignmentId: number | null; assignmentNullOnly: boolean }> {
  const safeSlug = sanitizeTenantSlug(tenantSlug);

  if (safeSlug === sanitizeTenantSlug(INTERNAL_CHAT_TENANT_SLUG)) {
    if (STAFF_PORTAL_ROLES.has(user.role) || user.role === "admin") {
      return { assignmentId: null, assignmentNullOnly: true };
    }
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal team chat is restricted." });
  }

  const loadAssignmentById = async (id: number) => {
    const { data, error } = await supabase
      .from("staff_client_assignments")
      .select("id, staff_id, tenant_slug")
      .eq("id", id)
      .eq("tenant_slug", safeSlug)
      .maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Assignment lookup failed: ${error.message}` });
    return data as { id: number; staff_id: number; tenant_slug: string } | null;
  };

  const loadAssignmentsForTenant = async () => {
    const { data, error } = await supabase
      .from("staff_client_assignments")
      .select("id, staff_id, tenant_slug")
      .eq("tenant_slug", safeSlug)
      .order("assigned_at", { ascending: true });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Assignment list failed: ${error.message}` });
    return (data || []) as Array<{ id: number; staff_id: number; tenant_slug: string }>;
  };

  // Staff/accountants can access two scopes for an assigned tenant:
  // 1) personal assignment lane (assignment_id = own assignment id)
  // 2) tenant group lane (assignment_id IS NULL) when no assignmentId is requested
  if (STAFF_PORTAL_ROLES.has(user.role)) {
    const assignments = await getStaffAssignments(user.id);
    const match = assignments.find((a) => sanitizeTenantSlug(a.tenant_slug) === safeSlug);
    if (!match) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tenant is not assigned to this staff member." });
    }

    const ownAssignmentId = Number(match.id);
    if (requestedAssignmentId != null) {
      if (Number(requestedAssignmentId) !== ownAssignmentId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only access your own assignment conversation." });
      }
      return { assignmentId: ownAssignmentId, assignmentNullOnly: false };
    }

    // No explicit assignment selected => tenant-wide shared Group Chat lane.
    return { assignmentId: null, assignmentNullOnly: true };
  }

  // Clients can choose one of the tenant's assigned accountant/staff lanes.
  // If no assignment is selected, client is in tenant group chat scope (assignment_id IS NULL).
  if (user.role === "client") {
    if (requestedAssignmentId != null) {
      const assignment = await loadAssignmentById(Number(requestedAssignmentId));
      if (!assignment) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Selected assignment is invalid for this tenant." });
      }
      return { assignmentId: Number(assignment.id), assignmentNullOnly: false };
    }

    return { assignmentId: null, assignmentNullOnly: true };
  }

  // Admin/internal shared chat stays tenant-level unless explicitly narrowed by assignment.
  if (user.role === "admin") {
    if (requestedAssignmentId != null) {
      const assignment = await loadAssignmentById(Number(requestedAssignmentId));
      if (!assignment) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Selected assignment is invalid for this tenant." });
      }
      return { assignmentId: Number(assignment.id), assignmentNullOnly: false };
    }
    return { assignmentId: null, assignmentNullOnly: true };
  }

  return { assignmentId: null, assignmentNullOnly: true };
}

function normalizeUserId(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid user id" });
  }
  return n;
}

function makeDmKey(a: number, b: number): string {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return `dm:u${min}:u${max}`;
}

function parseDmParticipants(dmKey: string): { a: number; b: number } | null {
  const m = /^dm:u(\d+):u(\d+)$/.exec(dmKey || "");
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

async function assertDmAccess(currentUserId: number, dmKey: string): Promise<void> {
  const parsed = parseDmParticipants(dmKey);
  if (!parsed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Invalid DM scope" });
  }
  if (parsed.a !== currentUserId && parsed.b !== currentUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this DM." });
  }
}

async function canUsePeerForDm(currentUser: PortalUser, peerUserId: number, tenantSlug?: string): Promise<boolean> {
  const currentId = normalizeUserId(currentUser.id);
  if (peerUserId === currentId) return false;

  const { data: peer, error: peerErr } = await supabase
    .from("portal_users")
    .select("id, role")
    .eq("id", peerUserId)
    .maybeSingle();
  if (peerErr || !peer) return false;

  if (!(STAFF_PORTAL_ROLES.has(currentUser.role) || currentUser.role === "admin")) return false;

  // Admin can DM any portal user (all roles) once peer exists.
  if (currentUser.role === "admin") return true;

  if (tenantSlug && !isInternalChatSlug(tenantSlug)) {
    const safeSlug = sanitizeTenantSlug(tenantSlug);
    const { data: assignment, error: assignErr } = await supabase
      .from("staff_client_assignments")
      .select("id")
      .eq("tenant_slug", safeSlug)
      .eq("staff_id", peerUserId)
      .maybeSingle();
    if (!assignErr && assignment) return true;
  }

  const role = String((peer as any).role || "");
  return ["admin", "accounting_manager", "tax_manager", "accountant"].includes(role);
}

async function getRecentlyOnlineUserIds(userIds: number[]): Promise<Set<number>> {
  const uniqueIds = Array.from(new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!uniqueIds.length) return new Set<number>();

  const thresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("portal_push_tokens")
    .select("portal_user_id")
    .in("portal_user_id", uniqueIds)
    .eq("is_active", true)
    .gte("last_seen_at", thresholdIso);

  if (error) {
    const message = String((error as any)?.message || "");
    if (message.includes("code=42P01") || /relation .* does not exist/i.test(message)) {
      return new Set<number>();
    }
    console.warn("[chat.presence] failed to load online users", { message });
    return new Set<number>();
  }

  return new Set(
    ((data || []) as Array<{ portal_user_id: number | null }>)
      .map((row) => Number(row.portal_user_id ?? 0))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
}

type MentionRecipient = {
  id: number;
  displayName: string;
  email: string | null;
  assignmentId: number | null;
};

function mentionBoundaryBefore(ch?: string): boolean {
  return !ch || /\s|[([{"'`]/.test(ch);
}

function mentionBoundaryAfter(ch?: string): boolean {
  return !ch || /\s|[.,!?;:)\]}"'`]/.test(ch);
}

function normalizeMentionAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function toMessagePreview(text: string | null | undefined, max = 180): string {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

type ChatVisibilityScope = "workspace_public" | "staff_only";

function buildConversationId(input: {
  tenantSlug: string;
  assignmentId: number | null;
  dmKey: string | null;
}): string {
  if (input.dmKey) return `dm:${input.dmKey}`;
  if (input.assignmentId != null) return `assignment:${sanitizeTenantSlug(input.tenantSlug)}:${input.assignmentId}`;
  return `team:${sanitizeTenantSlug(input.tenantSlug)}`;
}

function resolveVisibilityScope(scope?: string | null): ChatVisibilityScope {
  return scope === "staff_only" ? "staff_only" : "workspace_public";
}

function assertVisibilityScopeAccess(user: PortalUser, visibilityScope: ChatVisibilityScope, viewAsClient = false): void {
  if (visibilityScope !== "staff_only") return;
  const role = String(user.role || "");
  const canUseInternal = role === "admin" || STAFF_PORTAL_ROLES.has(role as any);
  if (!canUseInternal) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are staff-only." });
  }
  if (!viewAsClient) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are only available in Workspace Chat mode." });
  }
}

function normalizeDocTypeValue(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Other";
  const lower = normalized.toLowerCase();
  if (lower === "chat_attachment" || lower === "chat attachment") {
    return "Chat Attachments";
  }
  if (lower.startsWith("chat_attachment/")) {
    return `Chat Attachments/${normalized.slice("chat_attachment/".length)}`;
  }
  if (lower.startsWith("chat attachment/")) {
    return `Chat Attachments/${normalized.slice("chat attachment/".length)}`;
  }
  return normalized;
}

function extractMentionedUserIds(body: string, candidates: MentionRecipient[]): number[] {
  const text = (body || "").trim();
  if (!text) return [];

  const byId = new Map<number, MentionRecipient>();
  for (const c of candidates) byId.set(Number(c.id), c);

  const labels = candidates
    .map((c) => ({ id: Number(c.id), label: `@${(c.displayName || "").trim()}` }))
    .filter((x) => x.label.length > 1)
    .sort((a, b) => b.label.length - a.label.length);

  const lower = text.toLowerCase();
  const found = new Set<number>();

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@" || !mentionBoundaryBefore(text[i - 1])) continue;

    let matched = false;
    for (const item of labels) {
      const cand = item.label.toLowerCase();
      if (lower.slice(i, i + cand.length) !== cand) continue;
      if (!mentionBoundaryAfter(text[i + cand.length])) continue;
      found.add(item.id);
      i += Math.max(0, cand.length - 1);
      matched = true;
      break;
    }

    if (matched) continue;

    // Fallback tokenized mention, e.g. @username / @display_name
    let j = i + 1;
    while (j < text.length && !mentionBoundaryAfter(text[j])) j += 1;
    const token = text.slice(i, j);
    const norm = normalizeMentionAlias(token);
    if (!norm) continue;

    for (const c of candidates) {
      const aliases = new Set<string>();
      aliases.add(normalizeMentionAlias(c.displayName));
      if (c.email) {
        const local = String(c.email).split("@")[0] ?? "";
        aliases.add(normalizeMentionAlias(local));
      }
      if (aliases.has(norm)) {
        found.add(Number(c.id));
      }
    }
  }

  return Array.from(found).filter((id) => byId.has(id));
}

async function getMentionRecipientsForScope(
  actor: PortalUser,
  tenantSlug: string,
  assignmentId: number | null,
  dmKey: string | null,
): Promise<MentionRecipient[]> {
  const safeSlug = sanitizeTenantSlug(tenantSlug);

  if (dmKey) {
    const parsed = parseDmParticipants(dmKey);
    if (!parsed) return [];
    const ids = [parsed.a, parsed.b];
    const { data, error } = await supabase
      .from("portal_users")
      .select("id,name,email")
      .in("id", ids);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return ((data || []) as Array<{ id: number; name: string | null; email: string | null }>).map((u) => ({
      id: Number(u.id),
      displayName: (u.name || u.email || `User ${u.id}`).trim(),
      email: u.email ?? null,
      assignmentId: null,
    }));
  }

  if (safeSlug === sanitizeTenantSlug(INTERNAL_CHAT_TENANT_SLUG)) {
    const { data, error } = await supabase
      .from("portal_users")
      .select("id,name,email,role")
      .in("role", ["admin", "accounting_manager", "tax_manager", "accountant"])
      .order("name", { ascending: true });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return ((data || []) as Array<{ id: number; name: string | null; email: string | null }>).map((u) => ({
      id: Number(u.id),
      displayName: (u.name || u.email || `User ${u.id}`).trim(),
      email: u.email ?? null,
      assignmentId: null,
    }));
  }

  const [tenantMembers, assignmentRows] = await Promise.all([
    listTenantMembers(safeSlug),
    (async () => {
      const { data, error } = await supabase
        .from("staff_client_assignments")
        .select("id, staff_id")
        .eq("tenant_slug", safeSlug)
        .order("assigned_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data || []) as Array<{ id: number; staff_id: number }>;
    })(),
  ]);

  const laneByStaff = new Map<number, number>();
  for (const a of assignmentRows) {
    const sid = Number(a.staff_id);
    if (!laneByStaff.has(sid)) laneByStaff.set(sid, Number(a.id));
  }

  const userMap = new Map<number, MentionRecipient>();
  for (const m of tenantMembers) {
    const id = Number(m.id);
    userMap.set(id, {
      id,
      displayName: (m.name || m.email || `User ${m.id}`).trim(),
      email: m.email ?? null,
      assignmentId: laneByStaff.get(id) ?? null,
    });
  }

  const staffIds = Array.from(new Set(assignmentRows.map((a) => Number(a.staff_id)).filter((n) => Number.isFinite(n) && n > 0)));
  const missing = staffIds.filter((id) => !userMap.has(id));
  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("portal_users")
      .select("id,name,email")
      .in("id", missing);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    for (const u of (data || []) as Array<{ id: number; name: string | null; email: string | null }>) {
      const id = Number(u.id);
      userMap.set(id, {
        id,
        displayName: (u.name || u.email || `User ${id}`).trim(),
        email: u.email ?? null,
        assignmentId: laneByStaff.get(id) ?? null,
      });
    }
  }

  let recipients = Array.from(userMap.values());
  if (assignmentId != null) {
    recipients = recipients.filter((r) => r.assignmentId == null || Number(r.assignmentId) === Number(assignmentId));
  }

  // Defensive: ensure actor itself is always represented for alias matching/self-skip rules.
  const actorId = normalizeUserId(actor.id);
  if (!recipients.some((r) => r.id === actorId)) {
    recipients.push({
      id: actorId,
      displayName: (actor.name || actor.email || `User ${actor.id}`).trim(),
      email: actor.email,
      assignmentId: null,
    });
  }

  return recipients;
}

type MentionNotificationRow = {
  id: number;
  recipient_user_id: number;
  sender_user_id: number | null;
  notification_type: string;
  title: string;
  content: string | null;
  tenant_slug: string | null;
  assignment_id: number | null;
  dm_key: string | null;
  chat_message_id: number | null;
  thread_parent_id: number | null;
  target_path: string | null;
  created_at: string;
};

async function deliverMentionNotificationsToWebhook(rows: MentionNotificationRow[]): Promise<void> {
  if (!N8N_MENTION_NOTIFICATION_WEBHOOK_URL) return;
  if (!rows.length) return;

  await Promise.all(rows.map(async (row) => {
    const payload = {
      notification_id: row.id,
      recipient_user_id: row.recipient_user_id,
      sender_user_id: row.sender_user_id,
      notification_type: row.notification_type,
      title: row.title,
      content: row.content,
      tenant_slug: row.tenant_slug,
      assignment_id: row.assignment_id,
      dm_key: row.dm_key,
      chat_message_id: row.chat_message_id,
      thread_parent_id: row.thread_parent_id,
      target_path: row.target_path,
      created_at: row.created_at,
    };

    try {
      const res = await fetch(N8N_MENTION_NOTIFICATION_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const errMsg = `HTTP ${res.status}${body ? `: ${body.slice(0, 400)}` : ""}`;
        await supabase
          .from("portal_notifications")
          .update({
            delivery_status: "webhook_failed",
            delivery_attempted_at: new Date().toISOString(),
            delivery_error: errMsg,
          })
          .eq("id", row.id);
        console.error("[mention.notifications] webhook delivery failed", {
          notificationId: row.id,
          status: res.status,
          body: body.slice(0, 400),
        });
        return;
      }

      await supabase
        .from("portal_notifications")
        .update({
          delivery_status: "webhook_sent",
          delivery_attempted_at: new Date().toISOString(),
          delivery_error: null,
        })
        .eq("id", row.id);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("portal_notifications")
        .update({
          delivery_status: "webhook_failed",
          delivery_attempted_at: new Date().toISOString(),
          delivery_error: errMsg.slice(0, 1000),
        })
        .eq("id", row.id);
      console.error("[mention.notifications] webhook delivery exception", {
        notificationId: row.id,
        error: errMsg,
      });
    }
  }));
}

async function createMentionNotifications(params: {
  req?: any;
  actor: PortalUser;
  tenantSlug: string;
  tenantName?: string | null;
  assignmentId: number | null;
  dmKey: string | null;
  messageId: number;
  parentId?: number | null;
  body: string | null | undefined;
}): Promise<void> {
  const { req, actor, tenantSlug, tenantName, assignmentId, dmKey, messageId, parentId, body } = params;
  const text = (body || "").trim();
  if (!text) return;

  const senderId = normalizeUserId(actor.id);
  const recipients = await getMentionRecipientsForScope(actor, tenantSlug, assignmentId, dmKey);
  const mentionedIds = extractMentionedUserIds(text, recipients)
    .filter((id) => id !== senderId);

  const uniqueRecipientIds = Array.from(new Set(mentionedIds));
  if (!uniqueRecipientIds.length) return;

  const conversationId = buildConversationId({ tenantSlug, assignmentId, dmKey });

  await writeActivityLog({
    req,
    actor,
    action_type: "mention_created",
    entity_type: "chat_message",
    entity_id: String(messageId),
    tenant_slug: tenantSlug,
    previous_value: null,
    new_value: null,
    metadata: {
      conversation_id: conversationId,
      thread_id: parentId ?? null,
      mentioned_user_ids: uniqueRecipientIds,
      mentioned_users: uniqueRecipientIds.map((id) => {
        const r = recipients.find((x) => Number(x.id) === Number(id));
        return {
          id,
          name: r?.displayName ?? null,
          email: r?.email ?? null,
        };
      }),
      message_preview: toMessagePreview(text),
      message_length: text.length,
      related_message_id: messageId,
      source: "chat",
    },
    status: "success",
  });

  const contextLabel = dmKey
    ? "Direct Message"
    : (isInternalChatSlug(tenantSlug)
      ? "Team Chat"
      : (assignmentId != null ? `${tenantName ?? tenantSlug} Personal Chat` : `${tenantName ?? tenantSlug} Group Chat`));
  const preview = text.slice(0, 180);
  const targetPath = `/chat?tenant=${encodeURIComponent(tenantSlug)}${dmKey ? `&dm=${encodeURIComponent(dmKey)}` : ""}${assignmentId != null ? `&assignment=${assignmentId}` : ""}${parentId ? `&thread=${parentId}` : ""}`;

  const rows = uniqueRecipientIds.map((recipientId) => ({
    recipient_user_id: recipientId,
    sender_user_id: senderId,
    notification_type: "chat_mention",
    title: `${actor.name ?? actor.email ?? "Someone"} mentioned you in ${contextLabel}`,
    content: preview,
    tenant_slug: sanitizeTenantSlug(tenantSlug),
    assignment_id: assignmentId,
    dm_key: dmKey,
    chat_message_id: messageId,
    thread_parent_id: parentId ?? null,
    target_path: targetPath,
    is_read: false,
    delivery_status: "pending",
    delivery_attempted_at: null,
    delivery_error: null,
  }));

  const { data, error } = await supabase
    .from("portal_notifications")
    .insert(rows)
    .select("id, recipient_user_id, sender_user_id, notification_type, title, content, tenant_slug, assignment_id, dm_key, chat_message_id, thread_parent_id, target_path, created_at");

  if (error) {
    throw new Error(error.message);
  }

  // Fire-and-forget webhook delivery. DB row remains source of truth regardless of delivery success.
  void deliverMentionNotificationsToWebhook((data || []) as MentionNotificationRow[])
    .catch((err) => {
      console.error("[mention.notifications] webhook dispatch batch failed", {
        count: (data || []).length,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

async function deliverDocumentMovedWebhook(payload: {
  document_id: string;
  tenant_slug: string | null;
  moved_by_user_id: string;
  moved_by_name: string | null;
  moved_by_email: string | null;
  moved_by_role: PortalUser["role"];
  previous_folder: string;
  new_folder: string;
  file_name: string | null;
  file_path: string | null;
  moved_at: string;
  destination_folder_id?: number | null;
  destination_folder_name?: string | null;
  destination_folder_path?: string | null;
}): Promise<void> {
  if (!N8N_DOCUMENT_MOVED_WEBHOOK_URL) return;

  const body = {
    event: "document_moved",
    document_id: payload.document_id,
    tenant_slug: payload.tenant_slug,
    moved_by_user_id: payload.moved_by_user_id,
    moved_by_name: payload.moved_by_name,
    moved_by_email: payload.moved_by_email,
    moved_by_role: payload.moved_by_role,
    previous_folder: payload.previous_folder,
    new_folder: payload.new_folder,
    file_name: payload.file_name,
    file_path: payload.file_path,
    moved_at: payload.moved_at,
    destination_folder_id: payload.destination_folder_id ?? null,
    destination_folder_name: payload.destination_folder_name ?? null,
    destination_folder_path: payload.destination_folder_path ?? null,
    source: "portal_documents",
  };

  try {
    const res = await fetch(N8N_DOCUMENT_MOVED_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const responseText = await res.text().catch(() => "");
      console.error("[documents.move] webhook delivery failed", {
        status: res.status,
        response: responseText.slice(0, 500),
        payload: body,
      });
    }
  } catch (error) {
    console.error("[documents.move] webhook delivery exception", {
      error: error instanceof Error ? error.message : String(error),
      payload: body,
    });
  }
}

async function authorizeDocumentDeleteScope(
  user: PortalUser,
  ids: Array<string | number>,
  tenantSlugOverride?: string,
  activeClientWorkspaceSlug?: string | null,
  viewAsClientTenantSlug?: string | null,
): Promise<{ mode: "tenant"; tenantSlug: string } | { mode: "personal" }> {
  const normalizedIds = ids.map((id) => String(id));

  const { data, error } = await supabase
    .from("documents_metadata")
    .select("id, tenant_slug, uploaded_by_user_id")
    .in("id", normalizedIds);

  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Unable to validate document ownership: ${error.message}` });
  }

  const rows = (data || []) as Array<{ id: string; tenant_slug: string | null; uploaded_by_user_id: string | null }>;

  const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(user.role);
  const hasExplicitTenantContext = typeof tenantSlugOverride === "string" && tenantSlugOverride.trim().length > 0;
  const activeWorkspaceSlug = activeClientWorkspaceSlug ? sanitizeTenantSlug(activeClientWorkspaceSlug) : "";
  const viewAsSlug = viewAsClientTenantSlug ? sanitizeTenantSlug(viewAsClientTenantSlug) : "";
  const trustedWorkspaceSlug = activeWorkspaceSlug || viewAsSlug;

  // Staff/accountants deleting from personal docs mode (tenant_slug IS NULL),
  // unless they are in trusted client workspace context.
  if (isStaffPortfolioUser && !hasExplicitTenantContext && !trustedWorkspaceSlug) {
    const personalMismatches = rows.filter(
      (row) => row.tenant_slug !== null || String(row.uploaded_by_user_id ?? "") !== String(user.id),
    );

    if (personalMismatches.length > 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only delete your own uploaded documents in personal mode.",
      });
    }

    return { mode: "personal" };
  }

  const resolvedSlug = sanitizeTenantSlug(
    await resolveTenantSlug(
      user,
      tenantSlugOverride || trustedWorkspaceSlug || undefined,
      trustedWorkspaceSlug || undefined,
    ),
  );
  const tenantMismatches = rows.filter((row) => sanitizeTenantSlug(row.tenant_slug) !== resolvedSlug);

  console.info("[documents.delete] authorization decision", {
    userId: user.id,
    userEmail: user.email,
    role: user.role,
    tenantSlug: resolvedSlug,
    documentCount: rows.length,
    documentTenantSlugs: Array.from(new Set(rows.map((r) => sanitizeTenantSlug(r.tenant_slug)))),
    mismatchCount: tenantMismatches.length,
  });

  if (tenantMismatches.length > 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only delete documents from your own tenant.",
    });
  }

  return { mode: "tenant", tenantSlug: resolvedSlug };
}

/**
 * Tier guard — throws FORBIDDEN if the resolved tenant's package tier
 * does not include the given feature. Admins bypass all tier checks.
 */
async function assertTierAccess(user: PortalUser, featureKey: string, impersonateSlug?: string): Promise<void> {
  if (user.role === "admin") return; // admins always have access
  const slug = await resolveTenantSlug(user, impersonateSlug);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
  const tenantTierIdx = PACKAGE_TIERS.indexOf(tenant.package_tier as PackageTier);
  const requiredTierIdx = PACKAGE_TIERS.indexOf((TAB_ACCESS[featureKey] ?? "legacy") as PackageTier);
  if (tenantTierIdx < requiredTierIdx) {
    throw new TRPCError({ code: "FORBIDDEN", message: `This feature requires the ${TAB_ACCESS[featureKey]} tier or above.` });
  }
}

// ─── AI Summary helpers ───────────────────────────────────────────────────────
async function getAiSummary(slug: string, year: number, month: number) {
  const { data } = await supabase
    .from(`${slug}_ai_summaries`)
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .single();
  return data || null;
}

async function upsertAiSummary(slug: string, year: number, month: number, content: string) {
  await supabase
    .from(`${slug}_ai_summaries`)
    .upsert({ year, month, content, generated_at: new Date().toISOString() }, { onConflict: "year,month" });
}

async function updateTenantGhlNotes(slug: string, notes: string) {
  await supabase
    .from("portal_tenants")
    .update({ ghl_notes: notes, updated_at: new Date().toISOString() })
    .eq("slug", slug);
}

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    changePassword: protectedProcedure
      .input(z.object({ newPassword: z.string().min(8) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.supabase_uid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No Supabase auth account linked to this user" });
        }

        const { error } = await supabase.auth.admin.updateUserById(ctx.user.supabase_uid, {
          password: input.newPassword,
        });
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

        // Keep app profile in sync so RouteGuard knows setup is complete.
        const { error: profileUpdateError } = await supabase
          .from("portal_users")
          .update({ must_reset_password: false, updated_at: new Date().toISOString() })
          .eq("id", ctx.user.id);

        if (profileUpdateError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Password updated, but failed to update profile state: ${profileUpdateError.message}`,
          });
        }

        // Mark invite as accepted when client sets their password for the first time
        if (ctx.user.email) {
          await markInviteAccepted(ctx.user.email);
        }

        return { success: true, must_reset_password: false };
      }),
  }),

  notifications: router({
    registerPushToken: protectedProcedure
      .input(z.object({
        fcmToken: z.string().min(16).max(4096),
        deviceType: z.string().default("web"),
        userAgent: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const now = new Date().toISOString();
        const payload = {
          portal_user_id: Number(ctx.user.id),
          fcm_token: input.fcmToken,
          device_type: input.deviceType || "web",
          user_agent: input.userAgent ?? null,
          is_active: true,
          updated_at: now,
          last_seen_at: now,
        };

        const { data, error } = await supabase
          .from("portal_push_tokens")
          .upsert(payload, { onConflict: "fcm_token" })
          .select("id, portal_user_id, is_active, updated_at, last_seen_at")
          .single();

        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        }

        return { success: true, token: data };
      }),
  }),

  notes: router({
    list: protectedProcedure
      .input(z.object({
        q: z.string().trim().max(200).optional(),
        category: z.enum(["general", "bookkeeping", "tax", "payroll", "urgent", "follow_up"]).optional(),
        pinnedOnly: z.boolean().optional(),
        includeArchived: z.boolean().optional().default(false),
        sortBy: z.enum(["created_at", "updated_at", "title"]).optional().default("updated_at"),
        sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
        limit: z.number().int().min(1).max(100).optional().default(25),
        cursor: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);

        const items = await listWorkspaceNotes({
          tenant_slug: workspace.tenantSlug,
          q: input.q,
          category: input.category as WorkspaceNoteCategory | undefined,
          pinnedOnly: input.pinnedOnly,
          includeArchived: input.includeArchived,
          sortBy: input.sortBy,
          sortDir: input.sortDir,
          limit: input.limit,
        });

        const userIds = Array.from(
          new Set(
            items.flatMap((n) => [n.created_by_user_id, n.updated_by_user_id].filter(Boolean) as string[]),
          ),
        );

        let nameByUserId = new Map<string, { name: string | null; email: string | null }>();
        if (userIds.length > 0) {
          const { data: users, error: usersError } = await supabase
            .from("portal_users")
            .select("supabase_uid,name,email")
            .in("supabase_uid", userIds);
          if (usersError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: usersError.message });
          }
          nameByUserId = new Map(
            (users ?? []).map((u: any) => [String(u.supabase_uid), { name: u.name ?? null, email: u.email ?? null }]),
          );
        }

        const commentCounts = await countWorkspaceNoteCommentsByNoteIds({
          tenant_slug: workspace.tenantSlug,
          noteIds: items.map((n) => n.id),
        });

        const enriched = items.map((n) => {
          const created = nameByUserId.get(String(n.created_by_user_id));
          const updated = n.updated_by_user_id ? nameByUserId.get(String(n.updated_by_user_id)) : null;
          const created_by_name = created?.name || created?.email || "Unknown user";
          const updated_by_name = updated?.name || updated?.email || "Unknown user";
          return {
            ...n,
            created_by_name,
            updated_by_name,
            comments: commentCounts[n.id] ?? 0,
          };
        });

        return { items: enriched, nextCursor: null };
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().trim().min(1).max(160),
        content: z.string().trim().min(1).max(20000),
        category: z.enum(["general", "bookkeeping", "tax", "payroll", "urgent", "follow_up"]).optional().default("general"),
      }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);

        const note = await createWorkspaceNote({
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          title: input.title,
          content: input.content,
          category: input.category as WorkspaceNoteCategory,
          created_by_user_id: ctx.user!.supabase_uid ?? String(ctx.user!.id),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_created",
          entity_type: "internal_note",
          entity_id: String(note.id),
          file_name: note.title,
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { category: note.category, is_pinned: note.is_pinned, is_archived: note.is_archived },
        });

        return { success: true as const, note };
      }),

    update: protectedProcedure
      .input(z.object({
        noteId: z.string().uuid(),
        title: z.string().trim().min(1).max(160).optional(),
        content: z.string().trim().min(1).max(20000).optional(),
        category: z.enum(["general", "bookkeeping", "tax", "payroll", "urgent", "follow_up"]).optional(),
      }).refine(v => v.title !== undefined || v.content !== undefined || v.category !== undefined, {
        message: "At least one field must be updated.",
      }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        await assertNoteBelongsToWorkspace(input.noteId, workspace.tenantSlug);

        const note = await updateWorkspaceNote({
          noteId: input.noteId,
          tenant_slug: workspace.tenantSlug,
          title: input.title,
          content: input.content,
          category: input.category as WorkspaceNoteCategory | undefined,
          updated_by_user_id: (ctx.user!.supabase_uid ?? String(ctx.user!.id)),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_updated",
          entity_type: "internal_note",
          entity_id: String(note.id),
          file_name: note.title,
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { category: note.category },
        });

        return { success: true as const, note };
      }),

    delete: protectedProcedure
      .input(z.object({ noteId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        const note = await assertNoteBelongsToWorkspace(input.noteId, workspace.tenantSlug);

        await softDeleteWorkspaceNote({
          noteId: input.noteId,
          tenant_slug: workspace.tenantSlug,
          updated_by_user_id: (ctx.user!.supabase_uid ?? String(ctx.user!.id)),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_deleted",
          entity_type: "internal_note",
          entity_id: String(note.id),
          file_name: note.title,
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { deleted_at: new Date().toISOString() },
        });

        return { success: true as const, noteId: input.noteId };
      }),

    pin: protectedProcedure
      .input(z.object({ noteId: z.string().uuid(), isPinned: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        await assertNoteBelongsToWorkspace(input.noteId, workspace.tenantSlug);

        const note = await setWorkspaceNotePinned({
          noteId: input.noteId,
          tenant_slug: workspace.tenantSlug,
          isPinned: input.isPinned,
          updated_by_user_id: (ctx.user!.supabase_uid ?? String(ctx.user!.id)),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_pinned",
          entity_type: "internal_note",
          entity_id: String(note.id),
          file_name: note.title,
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { is_pinned: note.is_pinned },
        });

        return { success: true as const, note };
      }),

    archive: protectedProcedure
      .input(z.object({ noteId: z.string().uuid(), isArchived: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        await assertNoteBelongsToWorkspace(input.noteId, workspace.tenantSlug);

        const note = await setWorkspaceNoteArchived({
          noteId: input.noteId,
          tenant_slug: workspace.tenantSlug,
          isArchived: input.isArchived,
          updated_by_user_id: (ctx.user!.supabase_uid ?? String(ctx.user!.id)),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_archived",
          entity_type: "internal_note",
          entity_id: String(note.id),
          file_name: note.title,
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { is_archived: note.is_archived },
        });

        return { success: true as const, note };
      }),
  }),

  noteComments: router({
    list: protectedProcedure
      .input(z.object({ noteId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        await assertNoteBelongsToWorkspace(input.noteId, workspace.tenantSlug);

        const comments = await listWorkspaceNoteComments({
          note_id: input.noteId,
          tenant_slug: workspace.tenantSlug,
        });

        const userIds = Array.from(
          new Set(
            comments.flatMap((c) => [c.created_by_user_id, c.updated_by_user_id].filter(Boolean) as string[]),
          ),
        );

        let nameByUserId = new Map<string, { name: string | null; email: string | null }>();
        if (userIds.length > 0) {
          const { data: users, error: usersError } = await supabase
            .from("portal_users")
            .select("supabase_uid,name,email")
            .in("supabase_uid", userIds);
          if (usersError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: usersError.message });
          nameByUserId = new Map(
            (users ?? []).map((u: any) => [String(u.supabase_uid), { name: u.name ?? null, email: u.email ?? null }]),
          );
        }

        const items = comments.map((c) => {
          const created = nameByUserId.get(String(c.created_by_user_id));
          const updated = c.updated_by_user_id ? nameByUserId.get(String(c.updated_by_user_id)) : null;
          const created_by_name = created?.name || created?.email || "Unknown user";
          const updated_by_name = updated?.name || updated?.email || "Unknown user";
          return {
            ...c,
            created_by_name,
            updated_by_name,
          };
        });

        return { items };
      }),

    create: protectedProcedure
      .input(z.object({
        noteId: z.string().uuid(),
        content: z.string().trim().min(1).max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        await assertNoteBelongsToWorkspace(input.noteId, workspace.tenantSlug);

        const comment = await createWorkspaceNoteComment({
          note_id: input.noteId,
          tenant_slug: workspace.tenantSlug,
          content: input.content,
          created_by_user_id: ctx.user!.supabase_uid ?? String(ctx.user!.id),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_comment_created",
          entity_type: "internal_note_comment",
          entity_id: String(comment.id),
          file_name: comment.content.slice(0, 80),
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { note_id: comment.note_id },
        });

        return { success: true as const, comment };
      }),

    update: protectedProcedure
      .input(z.object({
        commentId: z.string().uuid(),
        content: z.string().trim().min(1).max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        const comment = await assertCommentBelongsToWorkspace(input.commentId, workspace.tenantSlug);

        const isAdmin = ctx.user!.role === "admin";
        const isOwner = String(comment.created_by_user_id) === String(ctx.user!.supabase_uid ?? "");
        if (!isAdmin && !isOwner) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own comments." });
        }

        const updated = await updateWorkspaceNoteComment({
          comment_id: input.commentId,
          tenant_slug: workspace.tenantSlug,
          content: input.content,
          updated_by_user_id: ctx.user!.supabase_uid ?? String(ctx.user!.id),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_comment_updated",
          entity_type: "internal_note_comment",
          entity_id: String(updated.id),
          file_name: updated.content.slice(0, 80),
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { note_id: updated.note_id },
        });

        return { success: true as const, comment: updated };
      }),

    delete: protectedProcedure
      .input(z.object({ commentId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertCanAccessInternalNotes(ctx);
        const workspace = await resolveActiveClientWorkspace(ctx as any);
        const comment = await assertCommentBelongsToWorkspace(input.commentId, workspace.tenantSlug);

        const isAdmin = ctx.user!.role === "admin";
        const isOwner = String(comment.created_by_user_id) === String(ctx.user!.supabase_uid ?? "");
        if (!isAdmin && !isOwner) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own comments." });
        }

        await softDeleteWorkspaceNoteComment({
          comment_id: input.commentId,
          tenant_slug: workspace.tenantSlug,
          updated_by_user_id: ctx.user!.supabase_uid ?? String(ctx.user!.id),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user!,
          action_type: "internal_note_comment_deleted",
          entity_type: "internal_note_comment",
          entity_id: String(comment.id),
          file_name: comment.content.slice(0, 80),
          tenant_slug: workspace.tenantSlug,
          organization_id: workspace.organizationId,
          status: "success",
          metadata: { note_id: comment.note_id, deleted_at: new Date().toISOString() },
        });

        return { success: true as const, commentId: input.commentId };
      }),
  }),

  activity: router({
    list: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        actionType: z.string().optional(),
        tenantSlug: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const isStaffOrAdmin = STAFF_PORTAL_ROLES.has(ctx.user.role) || ctx.user.role === "admin";
        if (!isStaffOrAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Activity log is restricted to staff/admin." });
        }

        return listActivityLogs({
          search: input?.search,
          actionType: input?.actionType,
          tenantSlug: input?.tenantSlug,
          from: input?.from,
          to: input?.to,
          limit: input?.limit ?? 300,
        });
      }),
  }),

  documentsAdmin: router({
    backfillOrganizationIds: adminProcedure
      .mutation(async () => {
        const result = await backfillDocumentsOrganizationIds();
        return { success: true, ...result };
      }),
  }),

  clientWorkspaces: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "client") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client workspace switching is available to client users only." });
      }

      const accessRows = await listClientWorkspaceAccessByUserId(ctx.user.id);
      const slugs = accessRows.map((r) => r.tenant_slug);
      const allTenants = await getAllPortalTenants();
      const tenantBySlug = new Map(allTenants.map((t) => [t.slug, t]));

      const items = accessRows
        .map((a) => {
          const tenant = tenantBySlug.get(a.tenant_slug);
          if (!tenant) return null;
          return {
            slug: tenant.slug,
            companyName: tenant.company_name,
            isActive: tenant.is_active,
            isChurned: tenant.is_churned,
            accessType: a.access_type,
            isPrimary: a.is_primary,
          };
        })
        .filter(Boolean);

      return items;
    }),

    current: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "client") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client workspace switching is available to client users only." });
      }

      const accessRows = await listClientWorkspaceAccessByUserId(ctx.user.id);
      const slugs = accessRows.map((r) => sanitizeTenantSlug(r.tenant_slug));
      const activeFromCookie = ctx.clientWorkspaceTenantSlug ? sanitizeTenantSlug(ctx.clientWorkspaceTenantSlug) : null;

      let activeSlug: string | null = null;
      if (activeFromCookie && slugs.includes(activeFromCookie)) {
        activeSlug = activeFromCookie;
      } else if (accessRows.length) {
        const primary = accessRows.find((r) => r.is_primary) ?? accessRows[0];
        activeSlug = sanitizeTenantSlug(primary.tenant_slug);
      } else if (ctx.user.tenant_slug) {
        activeSlug = sanitizeTenantSlug(ctx.user.tenant_slug);
      }

      if (!activeSlug) return { tenantSlug: null, workspace: null };

      const tenant = await getTenantBySlug(activeSlug);
      if (!tenant) return { tenantSlug: null, workspace: null };

      return {
        tenantSlug: tenant.slug,
        workspace: {
          slug: tenant.slug,
          companyName: tenant.company_name,
          isActive: tenant.is_active,
        },
      };
    }),

    switch: protectedProcedure
      .input(z.object({ tenantSlug: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "client") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Client workspace switching is available to client users only." });
        }

        const tenantSlug = input.tenantSlug.trim();
        if (!tenantSlug) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "tenantSlug is required" });
        }

        const access = await getClientWorkspaceAccessByUserAndTenant(ctx.user.id, tenantSlug);
        if (!access) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace." });
        }

        const tenant = await getTenantBySlug(tenantSlug);
        if (!tenant || !tenant.is_active) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        }

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(CLIENT_WORKSPACE_COOKIE, tenant.slug, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          tenantSlug: tenant.slug,
          workspace: {
            slug: tenant.slug,
            companyName: tenant.company_name,
            isActive: tenant.is_active,
          },
        };
      }),

    reset: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "client") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Client workspace switching is available to client users only." });
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CLIENT_WORKSPACE_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
  }),

  tenant: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const slugs = await resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug);
      if (!slugs.length) return null;
      return getTenantBySlug(slugs[0]);
    }),
    members: adminProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => listTenantMembers(input.slug)),
    addMember: adminProcedure
      .input(z.object({
        slug: z.string(),
        fullName: z.string().min(1),
        email: z.string().email(),
        title: z.string().optional(),
        portalOrigin: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await upsertTenantMember({
          tenantSlug: input.slug,
          fullName: input.fullName,
          email: input.email,
          title: input.title,
          portalOrigin: input.portalOrigin,
        });

        if (!result.invited) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.inviteError ?? "Invite failed" });
        }

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "member_added",
          entity_type: "user",
          tenant_slug: input.slug,
          file_name: null,
          new_value: input.email,
          metadata: {
            full_name: input.fullName,
            title: input.title ?? null,
            source: "tenant.members.add",
          },
          status: "success",
        });

        return { success: true, invited: result.invited };
      }),
    resendMemberInvite: adminProcedure
      .input(z.object({
        slug: z.string(),
        email: z.string().email(),
        fullName: z.string().optional(),
        portalOrigin: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await resendTenantMemberInvite({
          tenantSlug: input.slug,
          email: input.email,
          fullName: input.fullName,
          portalOrigin: input.portalOrigin,
        });
        if (!result.sent) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Failed to resend invite" });
        }
        return { success: true };
      }),
    removeMember: adminProcedure
      .input(z.object({
        slug: z.string(),
        memberId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await removeTenantMember({ tenantSlug: input.slug, memberId: input.memberId });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "member_removed",
          entity_type: "user",
          entity_id: String(input.memberId),
          tenant_slug: input.slug,
          metadata: {
            source: "tenant.members.remove",
          },
          status: "success",
        });

        return { success: true };
      }),
    getBySlug: adminProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => getTenantBySlug(input.slug)),
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") return getAllPortalTenants();

      // Staff/accountants with no assignments should see an empty tenant list,
      // not an error (prevents stale client-side cache from older sessions).
      if (STAFF_PORTAL_ROLES.has(ctx.user.role)) {
        const assignedSlugs = await getAssignedTenantSlugsForUser(ctx.user);
        if (!assignedSlugs.length) return [];
        const all = await getAllPortalTenants();
        return all.filter((t) => assignedSlugs.includes(sanitizeTenantSlug(t.slug)));
      }

      const slugs = await resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug);
      const all = await getAllPortalTenants();
      return all.filter((t) => slugs.includes(sanitizeTenantSlug(t.slug)));
    }),
    upsert: adminProcedure
      .input(z.object({
        slug: z.string(),
        companyName: z.string(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        packageTier: z.enum(["legacy", "momentum", "growth_1", "growth_2", "cfo"]),
        isActive: z.boolean().optional(),
        ghlNotes: z.string().optional(),
        sendInvite: z.boolean().optional(),
        portalOrigin: z.string().optional(), // frontend passes window.location.origin
      }))
      .mutation(async ({ input }) => {
        await upsertPortalTenant({
          slug: input.slug,
          company_name: input.companyName,
          contact_name: input.contactName,
          email: input.email,
          package_tier: input.packageTier,
          is_active: input.isActive ?? true,
          ghl_notes: input.ghlNotes,
        });
        // Auto-provision all Supabase tables for this tenant
        const provision = await provisionTenant(input.slug);

        const normalizedEmail = input.email?.trim().toLowerCase();

        // Real-client multi-workspace mapping: attach workspace to owner email without duplicating users.
        if (normalizedEmail) {
          const existingOwner = await getPortalUserByEmail(normalizedEmail);
          const owner = existingOwner ?? await upsertPortalUser({
            email: normalizedEmail,
            name: input.contactName ?? normalizedEmail,
            role: "client",
            tenant_slug: input.slug,
            must_reset_password: true,
          });

          if (owner) {
            const existingAccess = await listClientWorkspaceAccessByUserId(owner.id);
            const hasPrimary = existingAccess.some((r) => r.is_primary);
            await upsertClientWorkspaceAccess({
              portal_user_id: owner.id,
              tenant_slug: input.slug,
              access_type: "owner",
              is_primary: hasPrimary ? false : true,
            });
          }
        }

        // Send magic-link invite if requested and email is provided
        let invite: { sent: boolean; error?: string } | null = null;
        if (input.sendInvite && input.email) {
          const redirectTo = getInviteRedirectTo(input.portalOrigin);
          console.info("[tenant.upsert] invite redirect", {
            recipientEmail: normalizedEmail,
            redirectTo,
            nodeEnv: process.env.NODE_ENV,
            portalOriginProvided: !!input.portalOrigin,
            envPortalOriginPresent: !!(process.env.PORTAL_ORIGIN || process.env.PUBLIC_PORTAL_ORIGIN || process.env.APP_URL),
          });
          invite = await inviteClientByEmail(
            input.email,
            input.companyName,
            input.slug,
            redirectTo,
          );
        }
        return { success: true, provision, invite };
      }),
    sendInvite: adminProcedure
      .input(z.object({
        slug: z.string(),
        email: z.string().email(),
        contactName: z.string().optional(),
        portalOrigin: z.string(),
      }))
      .mutation(async ({ input }) => {
        const tenant = await getTenantBySlug(input.slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        const redirectTo = getInviteRedirectTo(input.portalOrigin);
        console.info("[tenant.resendInvite] invite redirect", {
          recipientEmail: input.email,
          redirectTo,
          nodeEnv: process.env.NODE_ENV,
          portalOriginProvided: !!input.portalOrigin,
          envPortalOriginPresent: !!(process.env.PORTAL_ORIGIN || process.env.PUBLIC_PORTAL_ORIGIN || process.env.APP_URL),
        });
        const result = await inviteClientByEmail(
          input.email,
          tenant.company_name,
          input.slug,
          redirectTo,
        );
        if (!result.sent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Invite failed" });
        return { success: true };
      }),
    provision: adminProcedure
      .input(z.object({ slug: z.string() }))
      .mutation(async ({ input }) => {
        const result = await provisionTenant(input.slug);
        return result;
      }),
    updateGhlNotes: adminProcedure
      .input(z.object({ slug: z.string(), notes: z.string() }))
      .mutation(async ({ input }) => {
        await updateTenantGhlNotes(input.slug, input.notes);
        return { success: true };
      }),
    archive: adminProcedure
      .input(z.object({ slug: z.string() }))
      .mutation(async ({ input }) => {
        await archiveTenant(input.slug);
        return { success: true };
      }),
    restore: adminProcedure
      .input(z.object({ slug: z.string() }))
      .mutation(async ({ input }) => {
        await restoreTenant(input.slug);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ slug: z.string() }))
      .mutation(async ({ input }) => {
        await deleteTenant(input.slug);
        return { success: true };
      }),
  }),

  financials: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number().optional(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        console.log("[OverviewScope]", {
          userId: ctx.user.id,
          role: ctx.user.role,
          resolvedSlugs: slugs,
        });

        if (slugs.length === 1) {
          return getFinancials(slugs[0], input.year, input.month);
        }

        const lists = await Promise.all(slugs.map((slug) => getFinancials(slug, input.year, input.month)));
        const byMonth = new Map<number, {
          year: number;
          month: number;
          revenue: number;
          budget_revenue: number;
          expenses: number;
          budget_expenses: number;
          net_profit: number;
          net_profit_margin: number;
          summary: string | null;
        }>();

        for (const rows of lists) {
          for (const row of rows) {
            const existing = byMonth.get(row.month) ?? {
              year: row.year,
              month: row.month,
              revenue: 0,
              budget_revenue: 0,
              expenses: 0,
              budget_expenses: 0,
              net_profit: 0,
              net_profit_margin: 0,
              summary: null,
            };
            existing.revenue += row.revenue ?? 0;
            existing.budget_revenue += row.budget_revenue ?? 0;
            existing.expenses += row.expenses ?? 0;
            existing.budget_expenses += row.budget_expenses ?? 0;
            byMonth.set(row.month, existing);
          }
        }

        const merged = Array.from(byMonth.values())
          .map((m, idx) => {
            const netProfit = m.revenue - m.expenses;
            const margin = m.revenue > 0 ? netProfit / m.revenue : 0;
            return {
              id: idx + 1,
              year: m.year,
              month: m.month,
              revenue: m.revenue,
              budget_revenue: m.budget_revenue,
              expenses: m.expenses,
              budget_expenses: m.budget_expenses,
              net_profit: netProfit,
              net_profit_margin: margin,
              summary: null,
            };
          })
          .sort((a, b) => a.month - b.month);

        return merged;
      }),
    lineItems: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        if (slugs.length === 1) {
          return getLineItems(slugs[0], input.year, input.month);
        }

        const lists = await Promise.all(slugs.map((slug) => getLineItems(slug, input.year, input.month)));
        const mergedByKey = new Map<string, { type: "income" | "expense"; label: string; amount: number }>();

        for (const rows of lists) {
          for (const row of rows) {
            const key = `${row.type}::${row.label}`;
            const existing = mergedByKey.get(key) ?? { type: row.type, label: row.label, amount: 0 };
            existing.amount += row.amount ?? 0;
            mergedByKey.set(key, existing);
          }
        }

        return Array.from(mergedByKey.values()).map((r, idx) => ({
          id: idx + 1,
          year: input.year,
          month: input.month,
          type: r.type,
          label: r.label,
          amount: r.amount,
          budget_amount: null,
        }));
      }),
    lineItemsByYear: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        if (slugs.length === 1) {
          return getLineItemsByYear(slugs[0], input.year);
        }

        const lists = await Promise.all(slugs.map((slug) => getLineItemsByYear(slug, input.year)));
        return lists.flat().map((row, idx) => ({ ...row, id: (idx + 1) * 10 }));
      }),
    upsert: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
        year: z.number(), month: z.number(),
        revenue: z.number(), budgetRevenue: z.number(),
        expenses: z.number(), budgetExpenses: z.number(),
        netProfit: z.number(), netProfitMargin: z.number(),
        summary: z.string().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        await upsertFinancial(input.tenantSlug, {
          year: input.year, month: input.month,
          revenue: input.revenue, budget_revenue: input.budgetRevenue,
          expenses: input.expenses, budget_expenses: input.budgetExpenses,
          net_profit: input.netProfit, net_profit_margin: input.netProfitMargin,
          summary: input.summary ?? null,
        });
        return { success: true };
      }),
    updateSummary: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
        year: z.number(),
        month: z.number(),
        summary: z.string(),
      }))
      .mutation(async ({ input }) => {
        await updateFinancialSummary(input.tenantSlug, input.year, input.month, input.summary);
        return { success: true };
      }),
    addLineItem: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
        year: z.number(), month: z.number(),
        type: z.enum(["income", "expense"]),
        label: z.string(), amount: z.number(),
      }))
      .mutation(async ({ input }) => {
        await insertLineItem(input.tenantSlug, {
          year: input.year, month: input.month,
          type: input.type, label: input.label, amount: input.amount,
        });
        return { success: true };
      }),
  }),

  documents: router({
    listFolders: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        if (isStaffPortfolioUser && !input.tenantSlug) {
          return listDocumentFolders(null);
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        return listDocumentFolders(slug);
      }),
    createFolder: protectedProcedure
      .input(
        z.object({
          tenantSlug: z.string().optional(),
          name: z.string().min(1).max(120),
          parentFolderId: z.number().int().positive().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        let tenantSlug: string | null = null;

        if (!isStaffPortfolioUser || input.tenantSlug) {
          tenantSlug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        }

        const folder = await createDocumentFolder({
          tenantSlug,
          parentFolderId: input.parentFolderId ?? null,
          name: input.name,
          createdByUserId: String(ctx.user.id),
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "folder_created",
          entity_type: "folder",
          entity_id: String(folder.id),
          tenant_slug: folder.tenant_slug,
          new_value: folder.full_path,
          metadata: {
            folder_name: folder.name,
            parent_folder_id: folder.parent_folder_id,
            source: "portal_documents",
          },
          status: "success",
        });

        return { success: true, folder };
      }),
    deleteFolder: protectedProcedure
      .input(
        z.object({
          folderId: z.number().int().positive(),
          tenantSlug: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const folder = await getDocumentFolderById(input.folderId);
        if (!folder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found." });
        }

        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        let allowedTenantSlug: string | null = null;

        if (folder.tenant_slug) {
          if (isStaffPortfolioUser && !input.tenantSlug) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context is required for this folder." });
          }
          allowedTenantSlug = await resolveChatTenantSlug(ctx.user, input.tenantSlug ?? folder.tenant_slug);
          if (sanitizeTenantSlug(folder.tenant_slug) !== sanitizeTenantSlug(allowedTenantSlug)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete folders from your own tenant." });
          }
        } else {
          if (!isStaffPortfolioUser) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this folder." });
          }
        }

        const docCount = await countDocumentsInFolderPath(folder.tenant_slug ?? null, String(folder.full_path));

        if (docCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This folder contains documents. Move or delete its documents first.",
          });
        }

        await deleteDocumentFolderById(Number(folder.id));

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "folder_deleted",
          entity_type: "folder",
          entity_id: String(folder.id),
          tenant_slug: folder.tenant_slug,
          previous_value: folder.full_path,
          metadata: {
            folder_name: folder.name,
            parent_folder_id: folder.parent_folder_id,
            source: "portal_documents",
          },
          status: "success",
        });

        return { success: true, folderId: Number(folder.id), parentFolderId: folder.parent_folder_id ?? null };
      }),
    recentClientUploads: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        const hasExplicitTenantContext = typeof input.tenantSlug === "string" && input.tenantSlug.trim().length > 0;

        let baseQuery = supabase
          .from("documents_metadata")
          .select("id,tenant_slug,doc_type,file_name,name,mime_type,uploaded_by_name,uploaded_by_user_id,created_at")
          .order("created_at", { ascending: false })
          .limit(Math.max(input.limit * 3, input.limit));

        if (isStaffPortfolioUser) {
          if (hasExplicitTenantContext) {
            const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
            baseQuery = baseQuery.eq("tenant_slug", slug);
          } else {
            const assignedSlugs = await getAssignedTenantSlugsForUser(ctx.user);
            if (!assignedSlugs.length) return [] as Array<any>;
            baseQuery = baseQuery.in("tenant_slug", assignedSlugs);
          }
        } else {
          const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
          baseQuery = baseQuery.eq("tenant_slug", slug);
        }

        const { data: docsRows, error: docsError } = await baseQuery;
        if (docsError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to load recent uploads: ${docsError.message}` });
        }

        const docs = (docsRows || []) as Array<{
          id: string | number;
          tenant_slug: string | null;
          doc_type: string | null;
          file_name: string | null;
          name: string | null;
          mime_type: string | null;
          uploaded_by_name: string | null;
          uploaded_by_user_id: string | null;
          created_at: string;
        }>;

        const uploaderIds = Array.from(new Set(docs.map((d) => String(d.uploaded_by_user_id ?? "")).filter(Boolean)));
        const tenantSlugs = Array.from(new Set(docs.map((d) => String(d.tenant_slug ?? "")).filter(Boolean)));

        const [{ data: uploaderRows }, { data: tenantRows }] = await Promise.all([
          uploaderIds.length
            ? supabase.from("portal_users").select("id,role,name,email").in("id", uploaderIds)
            : Promise.resolve({ data: [] as any[] }),
          tenantSlugs.length
            ? supabase.from("portal_tenants").select("slug,company_name").in("slug", tenantSlugs)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const uploaderById = new Map(
          ((uploaderRows || []) as Array<{ id: number | string; role: string | null; name: string | null; email: string | null }>).map((u) => [String(u.id), u]),
        );
        const tenantBySlug = new Map(
          ((tenantRows || []) as Array<{ slug: string; company_name: string | null }>).map((t) => [String(t.slug), t]),
        );

        const clientUploaded = docs.filter((d) => {
          const uploader = uploaderById.get(String(d.uploaded_by_user_id ?? ""));
          if (!uploader) return true;
          const role = String(uploader.role ?? "").toLowerCase();
          return role === "client" || role === "external_member" || role === "business_member";
        });

        return clientUploaded.slice(0, input.limit).map((d) => ({
          id: String(d.id),
          file_name: d.file_name ?? d.name ?? "Document",
          client_name: tenantBySlug.get(String(d.tenant_slug ?? ""))?.company_name ?? String(d.tenant_slug ?? "Unknown Client"),
          tenant_slug: d.tenant_slug,
          uploaded_by: d.uploaded_by_name ?? uploaderById.get(String(d.uploaded_by_user_id ?? ""))?.name ?? "Unknown",
          folder_path: normalizeDocTypeValue(d.doc_type),
          uploaded_at: d.created_at,
          mime_type: d.mime_type ?? null,
        }));
      }),
    dashboard: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        const hasExplicitTenantContext = typeof input.tenantSlug === "string" && input.tenantSlug.trim().length > 0;

        let query = supabase
          .from("documents_metadata")
          .select("id,doc_type,file_size,updated_at,file_name,name,created_at")
          .order("updated_at", { ascending: false, nullsFirst: false });

        let countQuery = supabase
          .from("documents_metadata")
          .select("id", { count: "exact", head: true });

        let supplementalRowsPromise: any = null;

        if (isStaffPortfolioUser && !hasExplicitTenantContext) {
          query = query.is("tenant_slug", null).eq("uploaded_by_user_id", String(ctx.user.id));
          countQuery = countQuery.is("tenant_slug", null).eq("uploaded_by_user_id", String(ctx.user.id));

          const accessibleSlugs = await resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug);
          if (accessibleSlugs.length > 0) {
            supplementalRowsPromise = supabase
              .from("documents_metadata")
              .select("id,doc_type,file_size,updated_at,file_name,name,created_at")
              .in("tenant_slug", accessibleSlugs)
              .order("updated_at", { ascending: false, nullsFirst: false });
          }
        } else {
          const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
          query = query.eq("tenant_slug", slug);
          countQuery = countQuery.eq("tenant_slug", slug);
        }

        const [{ data: rows, error }, { error: countError }, { data: supplementalRows, error: supplementalError }] = await Promise.all([
          query,
          countQuery,
          supplementalRowsPromise ?? Promise.resolve({ data: [], error: null }),
        ]);

        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to load dashboard metadata: ${error.message}` });
        }
        if (countError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to count documents: ${countError.message}` });
        }
        if (supplementalError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to load supplemental dashboard metadata: ${supplementalError.message}` });
        }

        const baseRows = [
          ...((rows || []) as Array<any>),
          ...((supplementalRows || []) as Array<any>),
        ];
        const dedupRows = new Map<string, any>();
        for (const row of baseRows) dedupRows.set(String(row.id), row);

        const normalized = Array.from(dedupRows.values()) as Array<{
          id: string | number;
          doc_type: string | null;
          file_size: number | null;
          updated_at: string | null;
          created_at: string | null;
          file_name: string | null;
          name: string | null;
        }>;

        const folderStats = new Map<string, { docCount: number; lastUpdated: string | null }>();
        let totalStorageBytes = 0;
        let lastUpdatedOverall: string | null = null;
        const totalDocumentCount = normalized.length;

        for (const row of normalized) {
          const folderPath = normalizeDocTypeValue(row.doc_type ?? "Other");
          const updated = row.updated_at ?? row.created_at ?? null;

          const segments = String(folderPath).split("/").filter(Boolean);
          const paths: string[] = [];
          for (let i = 0; i < segments.length; i++) {
            paths.push(segments.slice(0, i + 1).join("/"));
          }
          if (!paths.length) paths.push(folderPath);

          for (const path of paths) {
            const prev = folderStats.get(path) ?? { docCount: 0, lastUpdated: null };
            prev.docCount += 1;
            if (updated && (!prev.lastUpdated || updated > prev.lastUpdated)) {
              prev.lastUpdated = updated;
            }
            folderStats.set(path, prev);
          }

          totalStorageBytes += Number(row.file_size ?? 0);
          if (updated && (!lastUpdatedOverall || updated > lastUpdatedOverall)) {
            lastUpdatedOverall = updated;
          }
        }

        const clientFacingRecent = (ctx.user.role === "client") || hasExplicitTenantContext;

        const prettifyPath = (raw: string | null | undefined): string => {
          const normalizedPath = normalizeDocTypeValue(raw ?? "");
          return String(normalizedPath || "").split("/").filter(Boolean).join(" > ");
        };

        const extractPathRoot = (raw: string | null | undefined): string => {
          const normalizedPath = normalizeDocTypeValue(raw ?? "");
          return String(normalizedPath || "").split("/")[0] ?? "";
        };

        const staffActorRoles = ["admin", "accounting_manager", "tax_manager", "accountant"];
        const clientActionTypes = ["file_uploaded", "file_moved", "file_renamed", "file_deleted", "folder_created", "folder_renamed", "folder_deleted"];

        let recent: Array<{ id: string; file_name: string; folder_path: string; updated_at: string | null; message?: string | null }> = normalized.slice(0, 10).map((row) => ({
          id: String(row.id),
          file_name: row.file_name ?? row.name ?? "Document",
          folder_path: normalizeDocTypeValue(row.doc_type ?? "Other"),
          updated_at: row.updated_at ?? row.created_at ?? null,
          message: null,
        }));

        if (clientFacingRecent) {
          const recentTenantSlug = hasExplicitTenantContext
            ? sanitizeTenantSlug(input.tenantSlug)
            : sanitizeTenantSlug(await resolveChatTenantSlug(ctx.user, undefined));

          const { data: activityRows, error: activityErr } = await supabase
            .from("activity_logs")
            .select("id,actor_name,actor_role,action_type,file_name,previous_value,new_value,metadata,created_at,status")
            .eq("tenant_slug", recentTenantSlug)
            .in("action_type", clientActionTypes)
            .eq("status", "success")
            .order("created_at", { ascending: false })
            .limit(40);

          if (!activityErr && activityRows) {
            const filteredRows = (activityRows as Array<any>).filter((row) => {
              const roots = [
                extractPathRoot(row?.new_value),
                extractPathRoot(row?.previous_value),
                extractPathRoot((row?.metadata as any)?.folder_path),
              ].filter(Boolean);
              // Keep chat attachment activity visible to clients.
              return !roots.some((r) => r === "Internal Info");
            });

            recent = filteredRows.slice(0, 10).map((row) => {
              const actor = String(row.actor_name ?? row.actor_email ?? "A team member");
              const fileName = String(row.file_name ?? "Document");
              const toPath = prettifyPath(row.new_value ?? (row?.metadata as any)?.folder_path ?? null);
              const fromPath = prettifyPath(row.previous_value ?? null);

              let message = `${actor} updated ${fileName}`;
              if (row.action_type === "file_uploaded") message = `${actor} uploaded ${fileName}`;
              if (row.action_type === "file_moved") message = `${actor} moved ${fileName}${toPath ? ` to ${toPath}` : ""}`;
              if (row.action_type === "file_renamed") message = `${actor} renamed ${fromPath || "a file"} to ${fileName}`;
              if (row.action_type === "file_deleted") message = `${actor} deleted ${fileName}`;
              if (row.action_type === "folder_created") message = `${actor} created folder ${toPath || fileName}`;
              if (row.action_type === "folder_renamed") message = `${actor} renamed folder ${fromPath || ""}${toPath ? ` to ${toPath}` : ""}`;
              if (row.action_type === "folder_deleted") message = `${actor} deleted folder ${fromPath || fileName}`;

              return {
                id: String(row.id),
                file_name: fileName,
                folder_path: toPath || fromPath || "",
                updated_at: row.created_at ?? null,
                message,
              };
            });
          } else if (activityErr) {
            console.error("[documents.dashboard] client-facing recent activity load failed", activityErr.message);
          }
        }

        return {
          totals: {
            totalFolders: 0,
            totalDocuments: totalDocumentCount,
            storageBytes: totalStorageBytes,
            lastUpdated: lastUpdatedOverall,
          },
          folderStats: Object.fromEntries(Array.from(folderStats.entries()).map(([k, v]) => [k, v])),
          recent,
        };
      }),
    search: protectedProcedure
      .input(z.object({ q: z.string().min(1), tenantSlug: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }))
      .query(async ({ ctx, input }) => {
        const q = input.q.trim();
        const limit = input.limit ?? 40;
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        const hasExplicitTenantContext = typeof input.tenantSlug === "string" && input.tenantSlug.trim().length > 0;

        let folderQuery = supabase
          .from("portal_document_folders")
          .select("id,name,full_path,updated_at,parent_folder_id")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(limit);

        let docQuery = supabase
          .from("documents_metadata")
          .select("id,file_name,name,doc_type,description,file_url,file_key,created_at,updated_at,file_size,mime_type,year,month")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(limit);

        let personalDocQuery: any = null;
        let personalFolderQuery: any = null;

        if (isStaffPortfolioUser && !hasExplicitTenantContext) {
          const accessibleSlugs = await resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug);
          if (accessibleSlugs.length > 0) {
            folderQuery = folderQuery.in("tenant_slug", accessibleSlugs);
            docQuery = docQuery.in("tenant_slug", accessibleSlugs);
            personalFolderQuery = supabase
              .from("portal_document_folders")
              .select("id,name,full_path,updated_at,parent_folder_id")
              .order("updated_at", { ascending: false, nullsFirst: false })
              .limit(limit)
              .is("tenant_slug", null)
              .eq("created_by_user_id", String(ctx.user.id));
            personalDocQuery = supabase
              .from("documents_metadata")
              .select("id,file_name,name,doc_type,description,file_url,file_key,created_at,updated_at,file_size,mime_type,year,month")
              .order("updated_at", { ascending: false, nullsFirst: false })
              .limit(limit)
              .is("tenant_slug", null)
              .eq("uploaded_by_user_id", String(ctx.user.id));
          } else {
            folderQuery = folderQuery.is("tenant_slug", null);
            docQuery = docQuery.is("tenant_slug", null).eq("uploaded_by_user_id", String(ctx.user.id));
          }
        } else {
          const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
          folderQuery = folderQuery.eq("tenant_slug", slug);
          docQuery = docQuery.eq("tenant_slug", slug);
        }

        folderQuery = folderQuery.or(`name.ilike.%${q}%,full_path.ilike.%${q}%`);
        docQuery = docQuery.or(`file_name.ilike.%${q}%,name.ilike.%${q}%,doc_type.ilike.%${q}%`);
        if (personalFolderQuery) {
          personalFolderQuery = personalFolderQuery.or(`name.ilike.%${q}%,full_path.ilike.%${q}%`);
        }
        if (personalDocQuery) {
          personalDocQuery = personalDocQuery.or(`file_name.ilike.%${q}%,name.ilike.%${q}%,doc_type.ilike.%${q}%`);
        }

        const [{ data: folderRows, error: folderError }, { data: docRows, error: docError }, { data: personalFolderRows, error: personalFolderError }, { data: personalDocRows, error: personalDocError }] = await Promise.all([
          folderQuery,
          docQuery,
          personalFolderQuery ?? Promise.resolve({ data: [], error: null }),
          personalDocQuery ?? Promise.resolve({ data: [], error: null }),
        ]);

        if (folderError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to search folders: ${folderError.message}` });
        if (docError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to search documents: ${docError.message}` });
        if (personalFolderError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to search personal folders: ${personalFolderError.message}` });
        if (personalDocError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to search personal documents: ${personalDocError.message}` });

        const folderSource = [
          ...((folderRows || []) as Array<{ id: number; name: string; full_path: string; updated_at: string | null; parent_folder_id: number | null }>),
          ...((personalFolderRows || []) as Array<{ id: number; name: string; full_path: string; updated_at: string | null; parent_folder_id: number | null }>),
        ];
        const dedupFolders = new Map<string, { id: number; name: string; full_path: string; updated_at: string | null; parent_folder_id: number | null }>();
        for (const f of folderSource) dedupFolders.set(String(f.full_path), f);

        const folders = Array.from(dedupFolders.values()).map((f) => ({
          id: Number(f.id),
          name: String(f.name),
          full_path: String(f.full_path),
          updated_at: f.updated_at ?? null,
        }));

        const docSource = [
          ...((docRows || []) as Array<{ id: string | number; file_name: string | null; name: string | null; doc_type: string | null; description: string | null; file_url: string | null; file_key: string | null; created_at: string | null; updated_at: string | null; file_size: number | null; mime_type: string | null; year: number | null; month: number | null }>),
          ...((personalDocRows || []) as Array<{ id: string | number; file_name: string | null; name: string | null; doc_type: string | null; description: string | null; file_url: string | null; file_key: string | null; created_at: string | null; updated_at: string | null; file_size: number | null; mime_type: string | null; year: number | null; month: number | null }>),
        ];

        const dedupDocs = new Map<string, { id: string | number; file_name: string | null; name: string | null; doc_type: string | null; description: string | null; file_url: string | null; file_key: string | null; created_at: string | null; updated_at: string | null; file_size: number | null; mime_type: string | null; year: number | null; month: number | null }>();
        for (const d of docSource) dedupDocs.set(String(d.id), d);

        const documents = Array.from(dedupDocs.values()).map((d) => ({
          id: String(d.id),
          display_name: d.file_name ?? d.name ?? "Document",
          original_name: d.name ?? null,
          folder_path: normalizeDocTypeValue(d.doc_type ?? "Other"),
          uploaded_at: d.created_at ?? null,
          updated_at: d.updated_at ?? null,
          file_size: d.file_size ?? null,
          mime_type: d.mime_type ?? null,
          description: d.description ?? null,
          file_url: d.file_url ?? null,
          file_key: d.file_key ?? null,
          year: d.year ?? null,
          month: d.month ?? null,
        }));

        return { folders, documents };
      }),
    list: protectedProcedure
      .input(z.object({
        year: z.number().optional(),
        month: z.number().optional(),
        docType: z.string().optional(),
        folderPath: z.string().optional(),
        tenantSlug: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);

        // Staff/accountants default to personal operational document area
        // (their own uploads only, no tenant context) unless they explicitly select a tenant via View as.
        const selectedDocType = input.folderPath ?? input.docType;
        const isChatAttachmentsScope =
          selectedDocType === "Chat Attachments" ||
          selectedDocType === "chat_attachment" ||
          String(selectedDocType ?? "").startsWith("Chat Attachments/") ||
          String(selectedDocType ?? "").startsWith("chat_attachment/");
        const isClientUploadsScope =
          selectedDocType === "Client Uploads" ||
          String(selectedDocType ?? "").startsWith("Client Uploads/");

        const toLegacyChatDocType = (value: string | undefined): string | undefined => {
          if (!value) return value;
          if (value === "Chat Attachments") return "chat_attachment";
          if (value.startsWith("Chat Attachments/")) return `chat_attachment/${value.slice("Chat Attachments/".length)}`;
          return value;
        };

        const toDisplayChatDocType = (value: string | undefined): string | undefined => {
          if (!value) return value;
          if (value === "chat_attachment") return "Chat Attachments";
          if (value.startsWith("chat_attachment/")) return `Chat Attachments/${value.slice("chat_attachment/".length)}`;
          return value;
        };

        const effectiveDocType = toLegacyChatDocType(selectedDocType);
        const alternateChatDocType = isChatAttachmentsScope ? toDisplayChatDocType(effectiveDocType) : undefined;

        const mergeAndDedupe = (arrays: Array<Array<any>>) => {
          const merged = new Map<string, any>();
          for (const arr of arrays) {
            for (const doc of arr) {
              const normalizedDocType = normalizeDocTypeValue((doc as any).doc_type);
              if (isClientUploadsScope && !String(normalizedDocType).startsWith("Client Uploads")) continue;
              merged.set(String((doc as any).id), doc);
            }
          }
          return Array.from(merged.values());
        };

        const logClientUploadsDebug = async (docs: Array<any>, assignedSlugs: string[]) => {
          if (!isClientUploadsScope) return;
          const uploaderIds = Array.from(new Set(docs.map((d) => String(d.uploaded_by_user_id ?? "")).filter(Boolean)));
          const { data: uploaderRows } = uploaderIds.length
            ? await supabase
                .from("portal_users")
                .select("id,role,name,email")
                .in("id", uploaderIds)
            : { data: [] as any[] };
          const uploaderById = new Map(((uploaderRows || []) as Array<any>).map((u) => [String(u.id), u]));

          const clientRoleSet = new Set(["client", "external_member", "business_member"]);
          const uploadedByAssignedClients = docs.filter((d) => {
            const role = String(uploaderById.get(String(d.uploaded_by_user_id ?? ""))?.role ?? "").toLowerCase();
            return clientRoleSet.has(role);
          });
          const assignmentMatched = docs.filter((d) => assignedSlugs.includes(sanitizeTenantSlug(d.tenant_slug)));

          console.log("[documents.list][client_uploads_debug]", {
            userId: ctx.user.id,
            userRole: ctx.user.role,
            assignedTenantSlugs: assignedSlugs,
            totalReturned: docs.length,
            uploadedByAssignedClientRoles: uploadedByAssignedClients.length,
            assignmentMatched: assignmentMatched.length,
            docs: docs.map((d) => {
              const uploader = uploaderById.get(String(d.uploaded_by_user_id ?? ""));
              return {
                id: d.id,
                file_name: d.file_name ?? d.name ?? null,
                uploaded_by_user_id: d.uploaded_by_user_id ?? null,
                uploader_role: uploader?.role ?? null,
                tenant_slug: d.tenant_slug ?? null,
                assignment_match: assignedSlugs.includes(sanitizeTenantSlug(d.tenant_slug)),
              };
            }),
          });
        };

        if (isStaffPortfolioUser && !input.tenantSlug) {
          if (isChatAttachmentsScope) {
            const [accessibleSlugs, personalPrimary, personalAlternate] = await Promise.all([
              resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug),
              getDocumentsByUploader(ctx.user.id, input.year, input.month, effectiveDocType, undefined, {
                tenantIsNullOnly: true,
              }),
              alternateChatDocType && alternateChatDocType !== effectiveDocType
                ? getDocumentsByUploader(ctx.user.id, input.year, input.month, alternateChatDocType, undefined, {
                    tenantIsNullOnly: true,
                  })
                : Promise.resolve([]),
            ]);

            const tenantDocsArrays = await Promise.all(
              accessibleSlugs.flatMap((slug) => [
                getDocuments(slug, input.year, input.month, effectiveDocType),
                alternateChatDocType && alternateChatDocType !== effectiveDocType
                  ? getDocuments(slug, input.year, input.month, alternateChatDocType)
                  : Promise.resolve([]),
              ]),
            );

            const docs = mergeAndDedupe([personalPrimary, personalAlternate, ...tenantDocsArrays]);
            await logClientUploadsDebug(docs, accessibleSlugs);
            return docs;
          }

          if (isClientUploadsScope) {
            const [accessibleSlugs, personalDocs] = await Promise.all([
              resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug),
              getDocumentsByUploader(ctx.user.id, input.year, input.month, effectiveDocType, undefined, {
                tenantIsNullOnly: true,
              }),
            ]);
            const tenantDocsArrays = await Promise.all(
              accessibleSlugs.map((slug) => getDocuments(slug, input.year, input.month, effectiveDocType)),
            );
            const docs = mergeAndDedupe([personalDocs, ...tenantDocsArrays]);
            await logClientUploadsDebug(docs, accessibleSlugs);
            return docs;
          }

          return getDocumentsByUploader(ctx.user.id, input.year, input.month, effectiveDocType, undefined, {
            tenantIsNullOnly: true,
          });
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        if (isChatAttachmentsScope && alternateChatDocType && alternateChatDocType !== effectiveDocType) {
          const [primaryDocs, alternateDocs] = await Promise.all([
            getDocuments(slug, input.year, input.month, effectiveDocType),
            getDocuments(slug, input.year, input.month, alternateChatDocType),
          ]);
          return mergeAndDedupe([primaryDocs, alternateDocs]);
        }

        return getDocuments(slug, input.year, input.month, effectiveDocType);
      }),
    createSignedUpload: protectedProcedure
      .input(z.object({
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        fileSize: z.number().positive(),
        docType: z.string().default("Other"),
        year: z.number(),
        month: z.number().optional(),
        tenantSlug: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const extension = fileExtFromName(input.fileName);
        const extAllowed = !!extension && ALLOWED_VIDEO_EXTENSIONS.has(extension);
        if (!extAllowed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Signed upload is only available for supported video files." });
        }

        if (input.fileSize > MAX_VIDEO_UPLOAD_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Video is too large. Maximum upload size is 250MB." });
        }

        const videoValidation = isAllowedVideoFile({ fileName: input.fileName, mimeType: input.mimeType });
        if (!videoValidation.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported video format." });
        }

        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        const requestedTenantSlug = input.tenantSlug;
        const hasExplicitTenantContext = typeof requestedTenantSlug === "string" && requestedTenantSlug.trim().length > 0;

        let tenantSlug: string | null = null;
        if (!isStaffPortfolioUser || hasExplicitTenantContext) {
          const resolvedTenantSlug = await resolveTenantSlug(ctx.user, requestedTenantSlug);
          tenantSlug = sanitizeTenantSlug(resolvedTenantSlug);
        }

        const storagePath = buildDirectVideoStoragePath({
          tenantSlug,
          userId: Number(ctx.user.id),
          docType: input.docType,
          year: input.year,
          month: input.month ?? null,
          fileName: input.fileName,
          ext: videoValidation.ext,
        });

        const bucket = SUPABASE_STORAGE_BUCKET;
        const signed = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(storagePath);

        if (signed.error || !signed.data?.token) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: signed.error?.message || "Failed to create signed upload URL" });
        }

        const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath)?.data?.publicUrl ?? null;

        return {
          bucket,
          storagePath,
          token: signed.data.token,
          signedUrl: signed.data.signedUrl ?? null,
          publicUrl,
          tenantSlug,
          maxVideoBytes: MAX_VIDEO_UPLOAD_BYTES,
        };
      }),

    finalizeDirectUpload: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        fileSize: z.number().positive(),
        docType: z.string().default("Other"),
        description: z.string().optional(),
        year: z.number(),
        month: z.number().optional(),
        tenantSlug: z.string().optional(),
        storagePath: z.string().min(1),
        bucket: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.fileSize > MAX_VIDEO_UPLOAD_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Video is too large. Maximum upload size is 250MB." });
        }

        const isVideoMime = String(input.mimeType || "").toLowerCase().startsWith("video/");
        const videoValidation = isAllowedVideoFile({ fileName: input.fileName, mimeType: input.mimeType });
        if (!isVideoMime || !videoValidation.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported video format." });
        }

        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);
        const requestedTenantSlug = input.tenantSlug;
        const hasExplicitTenantContext = typeof requestedTenantSlug === "string" && requestedTenantSlug.trim().length > 0;

        let tenantSlug: string | null = null;
        if (!isStaffPortfolioUser || hasExplicitTenantContext) {
          const resolvedTenantSlug = await resolveTenantSlug(ctx.user, requestedTenantSlug);
          tenantSlug = sanitizeTenantSlug(resolvedTenantSlug);
        }

        const expectedPrefix = tenantSlug ?? `staff/${String(ctx.user.id)}`;
        const normalizedPath = String(input.storagePath || "").replace(/^\/+/, "");
        if (!normalizedPath.startsWith(`${expectedPrefix}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Invalid upload path for current user scope." });
        }

        if (input.bucket !== SUPABASE_STORAGE_BUCKET) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid upload bucket." });
        }

        const info = await supabase.storage.from(input.bucket).info(normalizedPath);
        if (info.error || !info.data) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded file not found in storage." });
        }

        const tenantRecord = tenantSlug ? await getTenantBySlug(tenantSlug) : null;
        const organizationId = tenantRecord?.id != null ? String(tenantRecord.id) : null;
        const uploadedByUserId = ctx.user.id != null ? String(ctx.user.id) : null;

        const publicUrl = supabase.storage.from(input.bucket).getPublicUrl(normalizedPath)?.data?.publicUrl ?? null;
        if (!publicUrl) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to resolve uploaded file URL." });
        }

        const documentInsertPayload = {
          organization_id: organizationId,
          client_id: null,
          name: input.fileName || input.name,
          description: input.description || null,
          doc_type: input.docType,
          file_key: normalizedPath,
          file_url: publicUrl,
          file_name: input.name || input.fileName || null,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          year: input.year,
          month: input.month ?? null,
          uploaded_by_name: ctx.user.name ?? ctx.user.email ?? null,
          uploaded_by_user_id: uploadedByUserId,
        };

        const insertedDoc = await insertDocument(tenantSlug, documentInsertPayload);

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "file_uploaded",
          entity_type: "document",
          entity_id: insertedDoc?.id ? String(insertedDoc.id) : null,
          tenant_slug: insertedDoc?.tenant_slug ?? tenantSlug,
          organization_id: insertedDoc?.organization_id ?? null,
          client_id: insertedDoc?.client_id ?? null,
          file_name: insertedDoc?.file_name ?? insertedDoc?.name ?? input.fileName ?? input.name,
          new_value: String(input.docType),
          metadata: {
            document_name: input.name,
            mime_type: input.mimeType,
            file_size: input.fileSize,
            year: input.year,
            month: input.month ?? null,
            source: "portal_documents_direct_upload",
          },
          status: "success",
        });

        return { success: true, url: publicUrl };
      }),

    upload: protectedProcedure
      .input(z.object({
        name: z.string(),
        fileBase64: z.string(),
        mimeType: z.string(),
        fileName: z.string().optional(),
        fileSize: z.number().optional(),
        docType: z.string().default("Other"),
        description: z.string().optional(),
        year: z.number(),
        month: z.number().optional(), // 1–12
        tenantSlug: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "documents";
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);

        // Staff/accountants without explicit View-as tenant upload into personal area (tenant_slug = null).
        const requestedTenantSlug = input.tenantSlug;
        const hasExplicitTenantContext = typeof requestedTenantSlug === "string" && requestedTenantSlug.trim().length > 0;

        let tenantSlug: string | null = null;
        if (!isStaffPortfolioUser || hasExplicitTenantContext) {
          let resolvedTenantSlug: string;
          try {
            resolvedTenantSlug = await resolveTenantSlug(ctx.user, requestedTenantSlug);
          } catch (error) {
            console.error("[documents.upload] unable to resolve tenant slug", {
              userId: ctx.user.id,
              userEmail: ctx.user.email,
              userTenantSlug: ctx.user.tenant_slug,
              requestedTenantSlug,
              error: error instanceof Error ? error.message : String(error),
            });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unable to resolve tenant slug for document upload.",
            });
          }

          tenantSlug = sanitizeTenantSlug(resolvedTenantSlug);

          console.info("[documents.upload] tenant slug resolution", {
            userId: ctx.user.id,
            userEmail: ctx.user.email,
            userTenantSlug: ctx.user.tenant_slug,
            requestedTenantSlug,
            resolvedTenantSlug,
            tenantSlug,
          });
        } else {
          console.info("[documents.upload] personal staff upload mode", {
            userId: ctx.user.id,
            role: ctx.user.role,
            requestedTenantSlug,
          });
        }

        const tenantRecord = tenantSlug ? await getTenantBySlug(tenantSlug) : null;
        const organizationId = tenantRecord?.id != null ? String(tenantRecord.id) : null;
        const uploadedByUserId = ctx.user.id != null ? String(ctx.user.id) : null;

        console.info("[documents.upload] tenant lookup result", {
          tenantSlug,
          tenantRecord,
        });

        if (tenantSlug && !organizationId) {
          console.warn("[documents.upload] organization_id unresolved; inserting null", {
            tenantSlug,
            userId: ctx.user.id,
            userEmail: ctx.user.email,
          });
        }

        console.info("[documents.upload] metadata ownership resolution", {
          tenantSlug,
          organizationId,
          uploadedByUserId,
        });

        let buffer: Buffer;
        try {
          buffer = Buffer.from(input.fileBase64, "base64");
        } catch (error) {
          console.error("[documents.upload] invalid base64 payload", {
            tenantSlug,
            fileName: input.fileName,
            mimeType: input.mimeType,
            error,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file payload." });
        }

        if (!buffer.length) {
          console.error("[documents.upload] empty decoded payload", {
            tenantSlug,
            fileName: input.fileName,
            fileBase64Length: input.fileBase64.length,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded file is empty or invalid." });
        }

        const ext = input.mimeType.split("/")[1]
          ?.replace("vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx")
          .replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx") || "bin";
        const safeDocType = (input.docType || "other").toLowerCase().replace(/[^a-z0-9]/g, "-") || "other";
        const safeYear = Number.isFinite(input.year) ? String(input.year) : "unknown_year";
        const safeMonth = input.month && Number.isFinite(input.month)
          ? String(input.month).padStart(2, "0")
          : "00";
        const timestamp = Date.now();
        const rand = Math.random().toString(36).slice(2);
        const originalFileName = input.fileName || `document-${timestamp}.${ext}`;
        const sanitizedFileName = sanitizeStorageFileName(originalFileName, ext);
        const storagePrefix = tenantSlug ?? `staff/${uploadedByUserId ?? "unknown"}`;
        const supabasePath = `${storagePrefix}/${safeDocType}/${safeYear}/${safeMonth}/${timestamp}-${rand}-${sanitizedFileName}`;

        console.info("[documents.upload] starting upload", {
          tenantSlug,
          bucketName,
          fileName: originalFileName,
          sanitizedFileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize ?? buffer.length,
          tableName: "documents_metadata",
        });

        let fileUrl: string;
        let fileKey: string;

        try {
          const uploaded = await storagePut(supabasePath, buffer, input.mimeType);
          fileUrl = uploaded.url;
          fileKey = uploaded.key;
        } catch (primaryUploadError) {
          const primaryMessage =
            primaryUploadError instanceof Error ? primaryUploadError.message : String(primaryUploadError);

          console.error("[documents.upload] storage upload failed", {
            tenantSlug,
            bucketName,
            path: supabasePath,
            error: primaryMessage,
          });

          const fallbackKey = `docs/${storagePrefix}/${safeDocType}/${timestamp}-${rand}.${ext}`;
          try {
            const fallbackResult = await storagePut(fallbackKey, buffer, input.mimeType);
            fileUrl = fallbackResult.url;
            fileKey = fallbackResult.key;
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            console.error("[documents.upload] fallback upload failed", {
              tenantSlug,
              bucketName,
              path: fallbackKey,
              error: fallbackMessage,
            });
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Document storage upload failed: ${primaryMessage}`,
            });
          }
        }

        const documentInsertPayload = {
          organization_id: organizationId,
          client_id: null,
          // Keep original file name for reference / retrieval metadata
          name: input.fileName || input.name,
          description: input.description || null,
          doc_type: input.docType,
          file_key: fileKey,
          file_url: fileUrl,
          // file_name is the portal display name used across document cards/list widgets
          file_name: input.name || input.fileName || null,
          file_size: input.fileSize || null,
          mime_type: input.mimeType,
          year: input.year,
          month: input.month ?? null,
          uploaded_by_name: ctx.user.name ?? ctx.user.email ?? null,
          uploaded_by_user_id: uploadedByUserId,
        };

        console.info("[documents.upload] final insert payload", {
          tenantSlug,
          payload: documentInsertPayload,
        });

        let insertedDoc: any = null;
        try {
          insertedDoc = await insertDocument(tenantSlug, documentInsertPayload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          console.error("[DocumentUploadError]", {
            error,
            payload: {
              tenantSlug,
              tableName: "documents_metadata",
              uploaded_by_name: ctx.user.name ?? ctx.user.email ?? null,
              fileKey,
              documentInsertPayload,
            },
          });

          // Only return the explicit "table does not exist" message when the DB error
          // clearly indicates missing relation (Postgres 42P01).
          if (message.includes("code=42P01") || /relation .* does not exist/i.test(message)) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Document upload failed: documents_metadata table does not exist.",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Document upload failed while saving the document record: ${message}`,
          });
        }

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "file_uploaded",
          entity_type: "document",
          entity_id: insertedDoc?.id ? String(insertedDoc.id) : null,
          tenant_slug: insertedDoc?.tenant_slug ?? tenantSlug,
          organization_id: insertedDoc?.organization_id ?? null,
          client_id: insertedDoc?.client_id ?? null,
          file_name: insertedDoc?.file_name ?? insertedDoc?.name ?? input.fileName ?? input.name,
          new_value: String(input.docType),
          metadata: {
            document_name: input.name,
            mime_type: input.mimeType,
            file_size: input.fileSize ?? buffer.length,
            year: input.year,
            month: input.month ?? null,
            source: "portal_documents",
          },
          status: "success",
        });

        return { success: true, url: fileUrl };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.union([z.string(), z.number()]), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const authorizedScope = await authorizeDocumentDeleteScope(
          ctx.user,
          [input.id],
          input.tenantSlug,
          ctx.clientWorkspaceTenantSlug,
          ctx.viewAsClientTenantSlug,
        );

        const { data: existingRow } = await supabase
          .from("documents_metadata")
          .select("id,tenant_slug,organization_id,client_id,file_name,name,doc_type,file_key")
          .eq("id", String(input.id))
          .maybeSingle();

        if (authorizedScope.mode === "personal") {
          await deleteDocumentsByUploader(ctx.user.id, [input.id]);
        } else {
          await deleteDocument(authorizedScope.tenantSlug, input.id);
        }

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "file_deleted",
          entity_type: "document",
          entity_id: existingRow?.id ? String(existingRow.id) : String(input.id),
          tenant_slug: existingRow?.tenant_slug ?? (authorizedScope.mode === "tenant" ? authorizedScope.tenantSlug : null),
          organization_id: existingRow?.organization_id ?? null,
          client_id: existingRow?.client_id ?? null,
          file_name: existingRow?.file_name ?? existingRow?.name ?? null,
          previous_value: existingRow?.doc_type ?? null,
          metadata: {
            file_key: existingRow?.file_key ?? null,
            source: "portal_documents",
          },
          status: "success",
        });

        return { success: true };
      }),
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.union([z.string(), z.number()])).min(1), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const authorizedScope = await authorizeDocumentDeleteScope(
          ctx.user,
          input.ids,
          input.tenantSlug,
          ctx.clientWorkspaceTenantSlug,
          ctx.viewAsClientTenantSlug,
        );

        const normalizedIds = input.ids.map((id) => String(id));
        const { data: existingRows } = await supabase
          .from("documents_metadata")
          .select("id,tenant_slug,organization_id,client_id,file_name,name,doc_type,file_key")
          .in("id", normalizedIds);

        const result = authorizedScope.mode === "personal"
          ? await deleteDocumentsByUploader(ctx.user.id, input.ids)
          : await deleteDocuments(authorizedScope.tenantSlug, input.ids);

        for (const row of (existingRows || []) as Array<any>) {
          await writeActivityLog({
            req: ctx.req,
            actor: ctx.user,
            action_type: "file_deleted",
            entity_type: "document",
            entity_id: row?.id ? String(row.id) : null,
            tenant_slug: row?.tenant_slug ?? (authorizedScope.mode === "tenant" ? authorizedScope.tenantSlug : null),
            organization_id: row?.organization_id ?? null,
            client_id: row?.client_id ?? null,
            file_name: row?.file_name ?? row?.name ?? null,
            previous_value: row?.doc_type ?? null,
            metadata: {
              file_key: row?.file_key ?? null,
              bulk: true,
              source: "portal_documents",
            },
            status: "success",
          });
        }

        return { success: true, deleted: result.deleted };
      }),
    updateType: protectedProcedure
      .input(
        z.object({
          id: z.union([z.string(), z.number()]),
          docType: z.string().min(1).max(255),
          tenantSlug: z.string().optional(),
          destinationFolderId: z.number().int().positive().nullable().optional(),
          destinationFolderPath: z.string().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);

        // Fetch current metadata first so we can emit previous_folder in webhook payload.
        const { data: existingRow, error: existingError } = await supabase
          .from("documents_metadata")
          .select("id,tenant_slug,doc_type,file_name,file_key,name,uploaded_by_user_id")
          .eq("id", String(input.id))
          .maybeSingle();

        if (existingError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to load current document metadata: ${existingError.message}`,
          });
        }

        if (!existingRow) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
        }

        const previousFolderRaw = String(existingRow.doc_type ?? "Other");
        const previousFolder = previousFolderRaw.trim() || "Other";

        // No-op move: keep behavior unchanged and avoid duplicate webhook noise.
        if (previousFolder === input.docType) {
          return { success: true, document: existingRow };
        }

        // Staff/accountants in default context (no explicit tenant selected).
        // - If the document belongs to an assigned tenant, allow move.
        // - If tenant is null, only allow moving their own personal docs.
        if (isStaffPortfolioUser && !input.tenantSlug) {
          const existingTenantSlug = String(existingRow.tenant_slug ?? "").trim().toLowerCase();

          if (existingTenantSlug) {
            const allowedSlugs = await resolveTenantSlugsForUser(ctx.user, undefined, ctx.clientWorkspaceTenantSlug);
            if (!allowedSlugs.includes(existingTenantSlug)) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "You can only move documents for clients you are assigned to.",
              });
            }

            const updated = await updateDocumentType(existingTenantSlug, input.id, input.docType);
            const movedAt = new Date().toISOString();
            void deliverDocumentMovedWebhook({
              document_id: String(updated.id),
              tenant_slug: updated.tenant_slug ? String(updated.tenant_slug) : existingTenantSlug,
              moved_by_user_id: String(ctx.user.id),
              moved_by_name: ctx.user.name ?? null,
              moved_by_email: ctx.user.email ?? null,
              moved_by_role: ctx.user.role,
              previous_folder: previousFolder,
              new_folder: String(updated.doc_type ?? input.docType),
              file_name: (updated.file_name ?? updated.name ?? null) as string | null,
              file_path: (updated.file_key ?? null) as string | null,
              moved_at: movedAt,
              destination_folder_id: input.destinationFolderId ?? null,
              destination_folder_name: input.destinationFolderPath ? String(input.destinationFolderPath).split("/").pop() ?? null : null,
              destination_folder_path: input.destinationFolderPath ?? null,
            });

            await writeActivityLog({
              req: ctx.req,
              actor: ctx.user,
              action_type: "file_moved",
              entity_type: "document",
              entity_id: String(updated.id),
              tenant_slug: updated.tenant_slug ? String(updated.tenant_slug) : existingTenantSlug,
              organization_id: (updated.organization_id ?? null) as string | null,
              client_id: (updated.client_id ?? null) as string | null,
              file_name: (updated.file_name ?? updated.name ?? null) as string | null,
              previous_value: previousFolder,
              new_value: String(updated.doc_type ?? input.docType),
              metadata: {
                file_key: (updated.file_key ?? null) as string | null,
                moved_at: movedAt,
                source: "portal_documents",
              },
              status: "success",
            });

            return { success: true, document: updated };
          }

          const { data, error } = await supabase
            .from("documents_metadata")
            .update({ doc_type: input.docType, updated_at: new Date().toISOString() })
            .eq("id", String(input.id))
            .is("tenant_slug", null)
            .eq("uploaded_by_user_id", String(ctx.user.id))
            .select("*")
            .maybeSingle();

          if (error) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Failed to update document folder: ${error.message}`,
            });
          }

          if (!data) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only reclassify your own personal documents.",
            });
          }

          const movedAt = new Date().toISOString();
          void deliverDocumentMovedWebhook({
            document_id: String(data.id),
            tenant_slug: data.tenant_slug ? String(data.tenant_slug) : null,
            moved_by_user_id: String(ctx.user.id),
            moved_by_name: ctx.user.name ?? null,
            moved_by_email: ctx.user.email ?? null,
            moved_by_role: ctx.user.role,
            previous_folder: previousFolder,
            new_folder: String(data.doc_type ?? input.docType),
            file_name: (data.file_name ?? data.name ?? null) as string | null,
            file_path: (data.file_key ?? null) as string | null,
            moved_at: movedAt,
            destination_folder_id: input.destinationFolderId ?? null,
            destination_folder_name: input.destinationFolderPath ? String(input.destinationFolderPath).split("/").pop() ?? null : null,
            destination_folder_path: input.destinationFolderPath ?? null,
          });

          await writeActivityLog({
            req: ctx.req,
            actor: ctx.user,
            action_type: "file_moved",
            entity_type: "document",
            entity_id: String(data.id),
            tenant_slug: data.tenant_slug ? String(data.tenant_slug) : null,
            organization_id: (data.organization_id ?? null) as string | null,
            client_id: (data.client_id ?? null) as string | null,
            file_name: (data.file_name ?? data.name ?? null) as string | null,
            previous_value: previousFolder,
            new_value: String(data.doc_type ?? input.docType),
            metadata: {
              file_key: (data.file_key ?? null) as string | null,
              moved_at: movedAt,
              source: "portal_documents",
            },
            status: "success",
          });

          return { success: true, document: data };
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const updated = await updateDocumentType(slug, input.id, input.docType);

        const movedAt = new Date().toISOString();
        void deliverDocumentMovedWebhook({
          document_id: String(updated.id),
          tenant_slug: updated.tenant_slug ? String(updated.tenant_slug) : slug,
          moved_by_user_id: String(ctx.user.id),
          moved_by_name: ctx.user.name ?? null,
          moved_by_email: ctx.user.email ?? null,
          moved_by_role: ctx.user.role,
          previous_folder: previousFolder,
          new_folder: String(updated.doc_type ?? input.docType),
          file_name: (updated.file_name ?? updated.name ?? null) as string | null,
          file_path: (updated.file_key ?? null) as string | null,
          moved_at: movedAt,
          destination_folder_id: input.destinationFolderId ?? null,
          destination_folder_name: input.destinationFolderPath ? String(input.destinationFolderPath).split("/").pop() ?? null : null,
          destination_folder_path: input.destinationFolderPath ?? null,
        });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "file_moved",
          entity_type: "document",
          entity_id: String(updated.id),
          tenant_slug: updated.tenant_slug ? String(updated.tenant_slug) : slug,
          organization_id: (updated.organization_id ?? null) as string | null,
          client_id: (updated.client_id ?? null) as string | null,
          file_name: (updated.file_name ?? updated.name ?? null) as string | null,
          previous_value: previousFolder,
          new_value: String(updated.doc_type ?? input.docType),
          metadata: {
            file_key: (updated.file_key ?? null) as string | null,
            moved_at: movedAt,
            source: "portal_documents",
          },
          status: "success",
        });

        return { success: true, document: updated };
      }),
    updateDate: protectedProcedure
      .input(
        z.object({
          id: z.union([z.string(), z.number()]),
          year: z.number().int().min(1900).max(3000),
          month: z.number().int().min(1).max(12).nullable(),
          tenantSlug: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);

        if (isStaffPortfolioUser && !input.tenantSlug) {
          const { data, error } = await supabase
            .from("documents_metadata")
            .update({ year: input.year, month: input.month, updated_at: new Date().toISOString() })
            .eq("id", String(input.id))
            .is("tenant_slug", null)
            .eq("uploaded_by_user_id", String(ctx.user.id))
            .select("*")
            .maybeSingle();

          if (error) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Failed to update document date: ${error.message}`,
            });
          }

          if (!data) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only update dates for your own personal documents.",
            });
          }

          return { success: true, document: data };
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const updated = await updateDocumentDate(slug, input.id, input.year, input.month);
        return { success: true, document: updated };
      }),
    updateFileName: protectedProcedure
      .input(
        z.object({
          id: z.union([z.string(), z.number()]),
          fileName: z.string().trim().min(1).max(255),
          tenantSlug: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isStaffPortfolioUser = STAFF_PORTAL_ROLES.has(ctx.user.role);

        const { data: existingRow } = await supabase
          .from("documents_metadata")
          .select("id,tenant_slug,organization_id,client_id,file_name,name,file_key")
          .eq("id", String(input.id))
          .maybeSingle();

        const previousName = (existingRow?.file_name ?? existingRow?.name ?? null) as string | null;

        if (isStaffPortfolioUser && !input.tenantSlug) {
          const { data, error } = await supabase
            .from("documents_metadata")
            .update({ file_name: input.fileName, updated_at: new Date().toISOString() })
            .eq("id", String(input.id))
            .is("tenant_slug", null)
            .eq("uploaded_by_user_id", String(ctx.user.id))
            .select("*")
            .maybeSingle();

          if (error) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Failed to rename document file: ${error.message}`,
            });
          }

          if (!data) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only rename your own personal documents.",
            });
          }

          await writeActivityLog({
            req: ctx.req,
            actor: ctx.user,
            action_type: "file_renamed",
            entity_type: "document",
            entity_id: String(data.id),
            tenant_slug: data.tenant_slug ? String(data.tenant_slug) : null,
            organization_id: (data.organization_id ?? null) as string | null,
            client_id: (data.client_id ?? null) as string | null,
            file_name: (data.file_name ?? data.name ?? input.fileName) as string,
            previous_value: previousName,
            new_value: input.fileName,
            metadata: {
              file_key: (data.file_key ?? existingRow?.file_key ?? null) as string | null,
              source: "portal_documents",
            },
            status: "success",
          });

          return { success: true, document: data };
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const updated = await updateDocumentFileName(slug, input.id, input.fileName);

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "file_renamed",
          entity_type: "document",
          entity_id: String(updated.id),
          tenant_slug: updated.tenant_slug ? String(updated.tenant_slug) : slug,
          organization_id: (updated.organization_id ?? null) as string | null,
          client_id: (updated.client_id ?? null) as string | null,
          file_name: (updated.file_name ?? updated.name ?? input.fileName) as string,
          previous_value: previousName,
          new_value: input.fileName,
          metadata: {
            file_key: (updated.file_key ?? existingRow?.file_key ?? null) as string | null,
            source: "portal_documents",
          },
          status: "success",
        });

        return { success: true, document: updated };
      }),
  }),

  coaching: router({
    list: protectedProcedure
      .input(z.object({ year: z.number().optional(), quarter: z.number().optional(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        console.log("[OverviewScope]", {
          userId: ctx.user.id,
          role: ctx.user.role,
          resolvedSlugs: slugs,
        });

        if (slugs.length === 1) {
          await assertTierAccess(ctx.user, "coaching", slugs[0]);
          return getCoachingItems(slugs[0], input.year, input.quarter);
        }

        const allLists = await Promise.all(
          slugs.map(async (slug) => {
            const tenant = await getTenantBySlug(slug);
            if (!tenant) return [];
            const tenantTierIdx = PACKAGE_TIERS.indexOf(tenant.package_tier as PackageTier);
            const requiredTierIdx = PACKAGE_TIERS.indexOf((TAB_ACCESS["coaching"] ?? "legacy") as PackageTier);
            if (tenantTierIdx < requiredTierIdx) return [];
            return getCoachingItems(slug, input.year, input.quarter);
          }),
        );

        return allLists.flat().map((row, idx) => ({ ...row, id: (idx + 1) * 10 }));
      }),
    add: adminProcedure
      .input(z.object({
        tenantSlug: z.string(), year: z.number(), quarter: z.number(),
        title: z.string(), description: z.string().optional(), sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await insertCoachingItem(input.tenantSlug, {
          year: input.year, quarter: input.quarter, title: input.title,
          description: input.description || null, completed: false, sort_order: input.sortOrder || 0,
        });
        return { success: true };
      }),
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), completed: z.boolean(), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        await toggleCoachingItem(slug, input.id, input.completed);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number(), tenantSlug: z.string() }))
      .mutation(async ({ input }) => {
        await deleteCoachingItem(input.tenantSlug, input.id);
        return { success: true };
      }),
    getNote: protectedProcedure
      .input(z.object({ year: z.number(), quarter: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        return getCoachingNote(slug, input.year, input.quarter);
      }),
    saveNote: protectedProcedure
      .input(z.object({ year: z.number(), quarter: z.number(), content: z.string(), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        await upsertCoachingNote(slug, input.year, input.quarter, input.content);
        return { success: true };
      }),
    nextStepsList: protectedProcedure
      .input(z.object({ year: z.number().int().min(2000).max(2100), quarter: z.number().int().min(1).max(4), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        return listCoachingNextSteps(slug, input.year, input.quarter);
      }),
    nextStepsCreate: protectedProcedure
      .input(z.object({
        year: z.number().int().min(2000).max(2100),
        quarter: z.number().int().min(1).max(4),
        tenantSlug: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional().nullable(),
        status: nextStepStatusSchema.optional(),
        priority: nextStepPrioritySchema.optional(),
        assignedTo: z.number().int().optional().nullable(),
        dueDate: z.string().optional().nullable(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isStaffActor(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot create next steps." });
        }
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const row = await createCoachingNextStep({
          tenant_slug: slug,
          year: input.year,
          quarter: input.quarter,
          title: input.title,
          description: input.description ?? null,
          status: input.status as CoachingNextStepStatus | undefined,
          priority: input.priority as CoachingNextStepPriority | undefined,
          assigned_to: input.assignedTo ?? null,
          due_date: input.dueDate ?? null,
          sort_order: input.sortOrder,
          created_by: ctx.user.id,
        });
        return { success: true, item: row };
      }),
    nextStepsUpdate: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        tenantSlug: z.string().optional(),
        title: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        status: nextStepStatusSchema.optional(),
        priority: nextStepPrioritySchema.optional(),
        assignedTo: z.number().int().optional().nullable(),
        dueDate: z.string().optional().nullable(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);

        const isStaff = isStaffActor(ctx.user);
        if (!isStaff) {
          const hasRestrictedPatch =
            input.title !== undefined ||
            input.description !== undefined ||
            input.priority !== undefined ||
            input.assignedTo !== undefined ||
            input.dueDate !== undefined ||
            input.sortOrder !== undefined;
          if (hasRestrictedPatch) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Clients can only update status." });
          }
          if (input.status === undefined) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Status is required." });
          }
        }

        const row = await updateCoachingNextStep({
          tenant_slug: slug,
          id: input.id,
          title: input.title,
          description: input.description,
          status: input.status as CoachingNextStepStatus | undefined,
          priority: input.priority as CoachingNextStepPriority | undefined,
          assigned_to: input.assignedTo,
          due_date: input.dueDate,
          sort_order: input.sortOrder,
          completed_by: input.status === undefined ? undefined : (input.status === "completed" ? ctx.user.id : null),
        });
        return { success: true, item: row };
      }),
    nextStepsDelete: protectedProcedure
      .input(z.object({ id: z.number().int(), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!isStaffActor(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot delete next steps." });
        }
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        await deleteCoachingNextStep(slug, input.id);
        return { success: true };
      }),
    nextStepsReorder: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        itemIds: z.array(z.number().int()).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isStaffActor(ctx.user)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot reorder next steps." });
        }
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const updates = input.itemIds.map((id, idx) =>
          updateCoachingNextStep({ tenant_slug: slug, id, sort_order: idx }),
        );
        await Promise.all(updates);
        return { success: true };
      }),
    meetingsList: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional(), mode: meetingModeSchema.optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const meetings = await listClientMeetings(slug, mode);
        const withCounts = await Promise.all(meetings.map(async (m) => {
          const items = await listClientMeetingActionItems(slug, m.id);
          const openCount = items.filter((i) => i.status !== "completed").length;
          return { ...m, open_action_items: openCount };
        }));
        return withCounts;
      }),
    meetingsGet: protectedProcedure
      .input(z.object({ id: z.number(), tenantSlug: z.string().optional(), mode: meetingModeSchema.optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const meeting = await getClientMeetingById(slug, input.id, mode);
        if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
        const actionItems = await listClientMeetingActionItems(slug, input.id);
        return { meeting, actionItems };
      }),
    meetingsCreate: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        mode: meetingModeSchema.optional(),
        title: z.string().min(1),
        meetingDate: z.string().min(1),
        meetingType: z.enum(["quarterly_review", "monthly_cfo", "tax_planning", "bookkeeping_review", "other"]).optional().nullable(),
        notes: z.string().optional().nullable(),
        status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "client") throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot create meetings." });
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const meeting = await insertClientMeeting({
          tenant_slug: slug,
          meeting_mode: mode,
          title: input.title,
          meeting_date: input.meetingDate,
          meeting_type: input.meetingType ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "completed",
          created_by_user_id: ctx.user.id,
          updated_by_user_id: ctx.user.id,
        });
        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "meeting_created",
          entity_type: "meeting",
          entity_id: String(meeting.id),
          tenant_slug: slug,
          file_name: meeting.title,
          new_value: meeting.status,
          metadata: { meeting_id: meeting.id, meeting_date: meeting.meeting_date, meeting_type: meeting.meeting_type },
        });
        return { success: true, meeting };
      }),
    meetingsUpdate: protectedProcedure
      .input(z.object({
        id: z.number(),
        tenantSlug: z.string().optional(),
        mode: meetingModeSchema.optional(),
        title: z.string().min(1),
        meetingDate: z.string().min(1),
        meetingType: z.enum(["quarterly_review", "monthly_cfo", "tax_planning", "bookkeeping_review", "other"]).optional().nullable(),
        notes: z.string().optional().nullable(),
        status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "client") throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot edit meetings." });
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const meeting = await updateClientMeeting({
          tenant_slug: slug,
          id: input.id,
          meeting_mode: mode,
          title: input.title,
          meeting_date: input.meetingDate,
          meeting_type: input.meetingType ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "completed",
          updated_by_user_id: ctx.user.id,
        });
        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "meeting_updated",
          entity_type: "meeting",
          entity_id: String(meeting.id),
          tenant_slug: slug,
          file_name: meeting.title,
          new_value: meeting.status,
          metadata: { meeting_id: meeting.id, meeting_date: meeting.meeting_date, meeting_type: meeting.meeting_type },
        });
        return { success: true, meeting };
      }),
    meetingsDelete: protectedProcedure
      .input(z.object({ id: z.number(), tenantSlug: z.string().optional(), mode: meetingModeSchema.optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "client") throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot delete meetings." });
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const existing = await getClientMeetingById(slug, input.id, mode);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
        await deleteClientMeeting(slug, input.id, mode);
        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "meeting_deleted",
          entity_type: "meeting",
          entity_id: String(input.id),
          tenant_slug: slug,
          file_name: existing.title,
          previous_value: existing.status,
          metadata: { meeting_id: input.id, meeting_date: existing.meeting_date },
        });
        return { success: true };
      }),
    meetingActionItemsUpsertBatch: protectedProcedure
      .input(z.object({
        meetingId: z.number(),
        tenantSlug: z.string().optional(),
        mode: meetingModeSchema.optional(),
        items: z.array(z.object({
          title: z.string().min(1),
          details: z.string().optional().nullable(),
          status: z.enum(["open", "in_progress", "completed"]).optional(),
          dueDate: z.string().optional().nullable(),
          completedAt: z.string().optional().nullable(),
          sortOrder: z.number().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "client") throw new TRPCError({ code: "FORBIDDEN", message: "Clients cannot edit action items." });
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const meeting = await getClientMeetingById(slug, input.meetingId, mode);
        if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
        const existingItems = await listClientMeetingActionItems(slug, input.meetingId);
        const rows = await replaceClientMeetingActionItems({
          tenant_slug: slug,
          meeting_id: input.meetingId,
          items: input.items.map((it) => ({
            title: it.title,
            details: it.details ?? null,
            status: it.status ?? "open",
            due_date: it.dueDate ?? null,
            completed_at: it.completedAt ?? null,
            sort_order: it.sortOrder,
          })),
        });
        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: existingItems.length === 0 && rows.length > 0 ? "meeting_action_item_created" : "meeting_action_item_updated",
          entity_type: "meeting_action_item",
          entity_id: String(input.meetingId),
          tenant_slug: slug,
          file_name: meeting.title,
          metadata: { meeting_id: input.meetingId, item_count: rows.length },
        });
        return { success: true, items: rows };
      }),
    meetingActionItemsUpdateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["open", "in_progress", "completed"]),
        tenantSlug: z.string().optional(),
        mode: meetingModeSchema.optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);
        const mode = resolveMeetingMode(input.mode);
        const actionItemRow = await supabase
          .from("client_meeting_action_items")
          .select("id, meeting_id")
          .eq("tenant_slug", slug)
          .eq("id", input.id)
          .maybeSingle();
        if (actionItemRow.error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: actionItemRow.error.message });
        }
        const meetingId = Number((actionItemRow.data as any)?.meeting_id ?? 0) || 0;
        if (!meetingId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Action item not found" });
        }
        const meeting = await getClientMeetingById(slug, meetingId, mode);
        if (!meeting) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Action item not found" });
        }
        const updated = await updateClientMeetingActionItemStatus({ tenant_slug: slug, id: input.id, status: input.status });
        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: input.status === "completed" ? "meeting_action_item_completed" : "meeting_action_item_updated",
          entity_type: "meeting_action_item",
          entity_id: String(updated.id),
          tenant_slug: slug,
          file_name: updated.title,
          new_value: updated.status,
          metadata: { meeting_id: updated.meeting_id },
        });
        return { success: true, item: updated };
      }),
  }),

  kpi: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "kpi_dashboard", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        return getKpiMetrics(slug, input.year);
      }),
    upsert: adminProcedure
      .input(z.object({
        tenantSlug: z.string(), year: z.number(), month: z.number(),
        cac: z.number().optional(), churnRate: z.number().optional(), ltv: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertKpiMetric(input.tenantSlug, {
          year: input.year, month: input.month,
          cac: input.cac ?? 0, churn_rate: input.churnRate ?? 0, ltv: input.ltv ?? 0,
        });
        return { success: true };
      }),
  }),

  time: router({
    timerRunning: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await assertTierAccess(ctx.user, "time_intelligence");
        const scope = await resolveTimerScope(ctx, input?.tenantSlug);

        let query = supabase
          .from("time_entries")
          .select("*")
          .eq("staff_user_id", Number(ctx.user.id))
          .eq("work_scope", scope.workScope)
          .eq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1);

        query = scope.workScope === "client"
          ? query.eq("tenant_slug", scope.tenantSlug)
          : query.is("tenant_slug", null);

        const { data, error } = await query.maybeSingle();

        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return data ?? null;
      }),
    timerTodayTracked: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await assertTierAccess(ctx.user, "time_intelligence");
        const scope = await resolveTimerScope(ctx, input?.tenantSlug);

        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).toISOString();

        let query = supabase
          .from("time_entries")
          .select("started_at, ended_at, duration_seconds, status")
          .eq("staff_user_id", Number(ctx.user.id))
          .eq("work_scope", scope.workScope)
          .gte("started_at", start)
          .lt("started_at", end);

        query = scope.workScope === "client"
          ? query.eq("tenant_slug", scope.tenantSlug)
          : query.is("tenant_slug", null);

        const { data, error } = await query;

        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

        const nowMs = Date.now();
        const total = (data || []).reduce((sum: number, row: any) => {
          const stored = Number(row.duration_seconds ?? 0);
          if (stored > 0) return sum + stored;

          if (row.status === "running" && row.started_at) {
            const startedMs = new Date(row.started_at).getTime();
            return sum + Math.max(0, Math.floor((nowMs - startedMs) / 1000));
          }

          if (row.started_at && row.ended_at) {
            const startedMs = new Date(row.started_at).getTime();
            const endedMs = new Date(row.ended_at).getTime();
            return sum + Math.max(0, Math.floor((endedMs - startedMs) / 1000));
          }

          return sum;
        }, 0);

        return { seconds: total };
      }),
    timerStart: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        projectId: z.string().nullable().optional(),
        taskId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        billable: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await assertTierAccess(ctx.user, "time_intelligence");
        const scope = await resolveTimerScope(ctx, input.tenantSlug);

        let existingQuery = supabase
          .from("time_entries")
          .select("*")
          .eq("staff_user_id", Number(ctx.user.id))
          .eq("work_scope", scope.workScope)
          .eq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1);

        existingQuery = scope.workScope === "client"
          ? existingQuery.eq("tenant_slug", scope.tenantSlug)
          : existingQuery.is("tenant_slug", null);

        const { data: existing, error: existingError } = await existingQuery.maybeSingle();

        if (existingError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existingError.message });
        if (existing) return { entry: existing, resumed: true as const };

        const payload = {
          work_scope: scope.workScope,
          tenant_slug: scope.tenantSlug,
          organization_id: null,
          staff_user_id: Number(ctx.user.id),
          project_id: input.projectId ?? null,
          task_id: input.taskId ?? null,
          started_at: new Date().toISOString(),
          ended_at: null,
          notes: input.notes ?? null,
          status: "running",
          billable: scope.workScope === "internal" ? false : (input.billable ?? true),
        };

        const { data, error } = await supabase
          .from("time_entries")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return { entry: data, resumed: false as const };
      }),
    timerStop: protectedProcedure
      .input(z.object({
        entryId: z.string(),
        tenantSlug: z.string().optional(),
        projectId: z.string().nullable().optional(),
        taskId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        billable: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await assertTierAccess(ctx.user, "time_intelligence");
        const scope = await resolveTimerScope(ctx, input.tenantSlug);

        let existingQuery = supabase
          .from("time_entries")
          .select("id, started_at, staff_user_id, tenant_slug, work_scope, status")
          .eq("id", input.entryId)
          .eq("staff_user_id", Number(ctx.user.id))
          .eq("work_scope", scope.workScope)
          .eq("status", "running");

        existingQuery = scope.workScope === "client"
          ? existingQuery.eq("tenant_slug", scope.tenantSlug)
          : existingQuery.is("tenant_slug", null);

        const { data: existing, error: existingError } = await existingQuery.maybeSingle();

        if (existingError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existingError.message });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Running timer entry not found." });

        const endedAt = new Date();

        let updateQuery = supabase
          .from("time_entries")
          .update({
            ended_at: endedAt.toISOString(),
            status: "stopped",
            notes: input.notes ?? null,
            project_id: input.projectId ?? null,
            task_id: input.taskId ?? null,
            billable: scope.workScope === "internal" ? false : (input.billable ?? true),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.entryId)
          .eq("staff_user_id", Number(ctx.user.id))
          .eq("work_scope", scope.workScope)
          .eq("status", "running");

        updateQuery = scope.workScope === "client"
          ? updateQuery.eq("tenant_slug", scope.tenantSlug)
          : updateQuery.is("tenant_slug", null);

        const { data, error } = await updateQuery
          .select("*")
          .single();

        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return data;
      }),
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getTimeLogsDb(ctx.user.id, input.year, input.month);
      }),
    getByYear: protectedProcedure
      .input(z.object({ year: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await assertTierAccess(ctx.user, "time_intelligence");
        return getTimeLogsByYearDb(ctx.user.id, input.year);
      }),
    add: protectedProcedure
      .input(z.object({
        year: z.number(), month: z.number(),
        logDate: z.string().nullable().optional(),
        teamMember: z.string().nullable().optional(),
        taskCategory: z.string().nullable().optional(),
        focusArea: z.string(),
        hours: z.number(),
        minutes: z.number().nullable().optional(),
        delegationNote: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await insertTimeLogDb({
          tenantId: ctx.user.id,
          year: input.year, month: input.month,
          logDate: input.logDate || null,
          teamMember: input.teamMember || null,
          taskCategory: input.taskCategory || null,
          focusArea: input.focusArea,
          hours: String(input.hours),
          minutes: input.minutes ?? null,
          notes: input.delegationNote || null,
        });
        return { success: true };
      }),
    addBulk: protectedProcedure
      .input(z.object({
        entries: z.array(z.object({
          year: z.number(), month: z.number(),
          logDate: z.string().nullable().optional(),
          teamMember: z.string().nullable().optional(),
          taskCategory: z.string().nullable().optional(),
          focusArea: z.string(),
          hours: z.number(),
          minutes: z.number().nullable().optional(),
          delegationNote: z.string().nullable().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        for (const e of input.entries) {
          await insertTimeLogDb({
            tenantId: ctx.user.id,
            year: e.year, month: e.month,
            logDate: e.logDate || null,
            teamMember: e.teamMember || null,
            taskCategory: e.taskCategory || null,
            focusArea: e.focusArea,
            hours: String(e.hours),
            minutes: e.minutes ?? null,
            notes: e.delegationNote || null,
          });
        }
        return { success: true, count: input.entries.length };
      }),
    deleteEntry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await deleteTimeLogDb(ctx.user.id, input.id);
        return { success: true };
      }),
    getTeamMembers: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getTeamMembersDb(ctx.user.id);
      }),
    addTeamMember: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await addTeamMemberDb(ctx.user.id, input.name);
        return { success: true };
      }),
    deleteTeamMember: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await deleteTeamMemberDb(ctx.user.id, input.id);
        return { success: true };
      }),
    getFocusAreas: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const existing = await getFocusAreasDb(ctx.user.id);
        const existingLabels = existing.map(f => f.label.toLowerCase());
        const defaults = [
          "Sales", "Marketing", "Consulting", "Strategy & Analysis",
          "Training & Leadership", "Operations", "Fulfillment",
          "Coaching", "Strategic Partner", "Other",
        ];
        const missing = defaults.filter(d => !existingLabels.includes(d.toLowerCase()));
        if (missing.length > 0) {
          for (const label of missing) {
            await addFocusAreaDb(ctx.user.id, label);
          }
          return getFocusAreasDb(ctx.user.id);
        }
        return existing;
      }),
    addFocusArea: protectedProcedure
      .input(z.object({ label: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await addFocusAreaDb(ctx.user.id, input.label);
        return { success: true };
      }),
    deleteFocusArea: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await deleteFocusAreaDb(ctx.user.id, input.id);
        return { success: true };
      }),
    seedFocusAreas: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const existing = await getFocusAreasDb(ctx.user.id);
        const existingLabels = existing.map(f => f.label.toLowerCase());
        const defaults = [
          "Sales", "Marketing", "Consulting", "Strategy & Analysis",
          "Training & Leadership", "Operations", "Fulfillment",
          "Coaching", "Strategic Partner", "Other",
        ];
        // Only insert defaults that are not already present (case-insensitive)
        const missing = defaults.filter(d => !existingLabels.includes(d.toLowerCase()));
        if (missing.length === 0) return { seeded: false };
        for (const label of missing) {
          await addFocusAreaDb(ctx.user.id, label);
        }
        return { seeded: true, added: missing };
      }),
    getTaskCategories: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getTaskCategoriesDb(ctx.user.id);
      }),
    addTaskCategory: protectedProcedure
      .input(z.object({ label: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await addTaskCategoryDb(ctx.user.id, input.label);
        return { success: true };
      }),
    deleteTaskCategory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await deleteTaskCategoryDb(ctx.user.id, input.id);
        return { success: true };
      }),

    updateTaskCategoryMeta: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().nullable().optional(),
        ownerName: z.string().nullable().optional(),
        ownerRole: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { id, ...meta } = input;
        await updateTaskCategoryMetaDb(ctx.user.id, id, meta);
        return { success: true };
      }),

    getCategoryIntelligence: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return getCategoryIntelligenceDb(ctx.user.id, input.year, input.month);
      }),

    runCategoryIntelligence: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const tenantId = ctx.user.id;

        // Gather time logs for the month
        const logs = await getTimeLogsDb(tenantId, input.year, input.month);
        if (logs.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No time logs found for this month." });

        // Gather task category metadata
        const categories = await getTaskCategoriesDb(tenantId);

        // Aggregate hours per category
        const totalHoursAll = logs.reduce((s, l) => s + parseFloat(String(l.hours)) + (l.minutes ?? 0) / 60, 0);
        const catMap: Record<string, {
          totalHours: number;
          focusAreas: string[];
          teamMembers: string[];
          description?: string | null;
          ownerName?: string | null;
          ownerRole?: string | null;
        }> = {};

        for (const log of logs) {
          const cat = log.taskCategory ?? "Uncategorized";
          if (!catMap[cat]) catMap[cat] = { totalHours: 0, focusAreas: [], teamMembers: [] };
          catMap[cat].totalHours += parseFloat(String(log.hours)) + (log.minutes ?? 0) / 60;
          if (log.focusArea && !catMap[cat].focusAreas.includes(log.focusArea)) catMap[cat].focusAreas.push(log.focusArea);
          if (log.teamMember && !catMap[cat].teamMembers.includes(log.teamMember)) catMap[cat].teamMembers.push(log.teamMember);
        }

        // Merge saved metadata
        for (const c of categories) {
          if (catMap[c.label]) {
            catMap[c.label].description = c.description;
            catMap[c.label].ownerName = c.ownerName;
            catMap[c.label].ownerRole = c.ownerRole;
          }
        }

        // Build prompt for LLM
        const catSummaries = Object.entries(catMap).map(([label, d]) => ({
          category: label,
          totalHours: Math.round(d.totalHours * 10) / 10,
          percentOfTotal: Math.round((d.totalHours / totalHoursAll) * 1000) / 10,
          focusAreas: d.focusAreas,
          teamMembers: d.teamMembers,
          description: d.description ?? null,
          ownerName: d.ownerName ?? null,
          ownerRole: d.ownerRole ?? null,
        }));

        const prompt = `You are a business operations analyst. Analyze the following time tracking data for a client and return a JSON array of category intelligence objects.

Month: ${input.month}/${input.year}
Total hours tracked: ${Math.round(totalHoursAll * 10) / 10}

Categories:
${JSON.stringify(catSummaries, null, 2)}

For each category, return a JSON object with these fields:
- category: string (exact category name from input)
- whatItMeans: string (1-2 sentence explanation of what this work represents in a business context. Use the provided description if available, otherwise infer from the category name and focus areas.)
- expertTrapRisk: boolean (true if a high-value owner role like CEO, Founder, or Director is spending significant hours on work that could be delegated — especially fulfillment, admin, or operational tasks)
- delegatable: boolean (true if this work type can reasonably be handed off to a lower-cost team member)
- delegateTo: string or null (if delegatable, suggest a role title to delegate to, e.g. "Virtual Assistant", "Bookkeeper", "Marketing Coordinator")
- aiRationale: string (1-2 sentences explaining your expert trap and delegation assessment)

Return ONLY a valid JSON array. No markdown, no explanation outside the JSON.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a business operations analyst. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
        });

        const rawContent = response.choices?.[0]?.message?.content ?? "[]";
        const raw = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        let results: Array<{
          category: string;
          whatItMeans: string;
          expertTrapRisk: boolean;
          delegatable: boolean;
          delegateTo: string | null;
          aiRationale: string;
        }> = [];

        try {
          const cleaned = raw.replace(/```json|```/g, "").trim();
          results = JSON.parse(cleaned);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON. Please try again." });
        }

        // Upsert results into DB
        for (const r of results) {
          const d = catMap[r.category];
          if (!d) continue;
          await upsertCategoryIntelligenceDb({
            tenantId,
            year: input.year,
            month: input.month,
            categoryLabel: r.category,
            focusArea: d.focusAreas[0] ?? null,
            ownerName: d.ownerName ?? d.teamMembers[0] ?? null,
            ownerRole: d.ownerRole ?? null,
            totalHours: String(Math.round(d.totalHours * 100) / 100),
            percentOfTotal: String(Math.round((d.totalHours / totalHoursAll) * 10000) / 100),
            whatItMeans: r.whatItMeans,
            expertTrapRisk: r.expertTrapRisk,
            delegatable: r.delegatable,
            delegateTo: r.delegateTo ?? null,
            aiRationale: r.aiRationale,
            generatedAt: new Date(),
          });
        }

        return getCategoryIntelligenceDb(tenantId, input.year, input.month);
      }),
  }),

  sales: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);

        if (slugs.length === 1) {
          await assertTierAccess(ctx.user, "sales_tracker", slugs[0]);
          return getSalesTracker(slugs[0], input.year, input.month);
        }

        const rows = await Promise.all(
          slugs.map(async (slug) => {
            const tenant = await getTenantBySlug(slug);
            if (!tenant) return null;
            const tenantTierIdx = PACKAGE_TIERS.indexOf(tenant.package_tier as PackageTier);
            const requiredTierIdx = PACKAGE_TIERS.indexOf((TAB_ACCESS["sales_tracker"] ?? "legacy") as PackageTier);
            if (tenantTierIdx < requiredTierIdx) return null;
            return getSalesTracker(slug, input.year, input.month);
          }),
        );

        const merged = rows.filter(Boolean) as Awaited<ReturnType<typeof getSalesTracker>>[];
        if (!merged.length) return null;

        return {
          id: 1,
          year: input.year,
          month: input.month,
          goal_clients: merged.reduce((s, r) => s + (r?.goal_clients ?? 0), 0),
          signed_clients: merged.reduce((s, r) => s + (r?.signed_clients ?? 0), 0),
          referral_count: merged.reduce((s, r) => s + (r?.referral_count ?? 0), 0),
          outbound_count: merged.reduce((s, r) => s + (r?.outbound_count ?? 0), 0),
        };
      }),
    getByYear: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);

        if (slugs.length === 1) {
          await assertTierAccess(ctx.user, "sales_tracker", slugs[0]);
          return getSalesTrackerByYear(slugs[0], input.year);
        }

        const lists = await Promise.all(
          slugs.map(async (slug) => {
            const tenant = await getTenantBySlug(slug);
            if (!tenant) return [];
            const tenantTierIdx = PACKAGE_TIERS.indexOf(tenant.package_tier as PackageTier);
            const requiredTierIdx = PACKAGE_TIERS.indexOf((TAB_ACCESS["sales_tracker"] ?? "legacy") as PackageTier);
            if (tenantTierIdx < requiredTierIdx) return [];
            return getSalesTrackerByYear(slug, input.year);
          }),
        );

        const byMonth = new Map<number, { month: number; goal: number; signed: number; referral: number; outbound: number }>();
        for (const rows of lists) {
          for (const row of rows) {
            const existing = byMonth.get(row.month) ?? { month: row.month, goal: 0, signed: 0, referral: 0, outbound: 0 };
            existing.goal += row.goal_clients ?? 0;
            existing.signed += row.signed_clients ?? 0;
            existing.referral += row.referral_count ?? 0;
            existing.outbound += row.outbound_count ?? 0;
            byMonth.set(row.month, existing);
          }
        }

        return Array.from(byMonth.values())
          .map((m, idx) => ({
            id: idx + 1,
            year: input.year,
            month: m.month,
            goal_clients: m.goal,
            signed_clients: m.signed,
            referral_count: m.referral,
            outbound_count: m.outbound,
          }))
          .sort((a, b) => a.month - b.month);
      }),
    upsert: adminProcedure
      .input(z.object({
        tenantSlug: z.string(), year: z.number(), month: z.number(),
        goalClients: z.number(), signedClients: z.number(),
        referralCount: z.number(), outboundCount: z.number(),
      }))
      .mutation(async ({ input }) => {
        await upsertSalesTracker(input.tenantSlug, {
          year: input.year, month: input.month,
          goal_clients: input.goalClients, signed_clients: input.signedClients,
          referral_count: input.referralCount, outbound_count: input.outboundCount,
        });
        return { success: true };
      }),
  }),

  roster: router({
    list: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const isStaffOrAdmin = STAFF_PORTAL_ROLES.has(ctx.user.role) || ctx.user.role === "admin";
        // Package tier gating applies to client tenant views, not staff/admin roster mode.
        if (!isStaffOrAdmin) {
          await assertTierAccess(ctx.user, "clients", input.tenantSlug);
        }
        const slugs = await resolveTenantSlugsForUser(ctx.user, input.tenantSlug, ctx.clientWorkspaceTenantSlug);

        if (ctx.user.role === "admin" || ctx.user.role === "client") {
          return getClientRoster(slugs[0]);
        }

        // Staff/accountants: aggregate assigned tenants only
        console.log("[PortalScope]", {
          userId: ctx.user.id,
          role: ctx.user.role,
          tenantSlug: ctx.user.tenant_slug,
        });
        console.log("[PortalScope] assigned tenants", slugs);

        const rosterLists = await Promise.all(slugs.map((slug) => getClientRoster(slug)));
        const mergedRosterRows = rosterLists.flatMap((list, slugIndex) =>
          list.map((entry) => ({
            ...entry,
            tenant_slug: slugs[slugIndex],
            // Keep numeric id shape for frontend keys while avoiding collisions across tenant tables.
            id: (slugIndex + 1) * 1_000_000 + Number(entry.id),
          })),
        );

        // Fallback source of truth: assigned portal tenants should still appear
        // even when tenant-specific roster tables are empty.
        const allTenants = await getAllPortalTenants();
        const tenantRows = allTenants.filter((t) => slugs.includes(sanitizeTenantSlug(t.slug)));

        const rosterTenantSlugs = new Set(
          mergedRosterRows
            .map((r) => sanitizeTenantSlug((r as unknown as { tenant_slug?: string | null }).tenant_slug ?? ""))
            .filter(Boolean),
        );

        const fallbackRows = tenantRows
          .filter((t) => !rosterTenantSlugs.has(sanitizeTenantSlug(t.slug)))
          .map((t, idx) => ({
            id: 9_000_000 + idx + 1,
            tenant_slug: sanitizeTenantSlug(t.slug),
            client_name: t.company_name,
            package: PACKAGE_LABELS[t.package_tier as PackageTier] ?? t.package_tier,
            monthly_amount: 0,
            signed_date: null,
            status: t.is_churned || !t.is_active ? "churned" as const : "active" as const,
            tenure_months: 0,
            ltv: 0,
            total_income: 0,
            notes: [t.contact_name, t.email].filter(Boolean).join(" · ") || null,
            created_at: t.created_at,
            updated_at: t.updated_at,
          }));

        const finalRows = [...mergedRosterRows, ...fallbackRows];

        console.log("[RosterListStaffDebug]", {
          userId: ctx.user.id,
          role: ctx.user.role,
          assignedSlugs: slugs,
          rowsCount: mergedRosterRows.length,
          rows: mergedRosterRows,
        });

        console.log("[RosterListStaffFinal]", {
          userId: ctx.user.id,
          role: ctx.user.role,
          assignedSlugs: slugs,
          tenantRowsCount: tenantRows?.length,
          finalRowsCount: finalRows?.length,
          finalRows,
        });

        return finalRows;
      }),
    add: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        clientName: z.string(),
        package: z.string(),
        monthlyAmount: z.number(),
        signedDate: z.string().nullable().optional(),
        status: z.enum(["active", "churned"]).optional(),
        tenureMonths: z.number().optional(),
        ltv: z.number().optional(),
        totalIncome: z.number().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "clients", input.tenantSlug);
        // Resolve tenant slug: admin can pass explicit slug, regular users use their own
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        await upsertClientRosterEntry(slug, {
          client_name: input.clientName,
          package: input.package,
          monthly_amount: input.monthlyAmount,
          signed_date: input.signedDate ?? null,
          status: input.status ?? "active",
          tenure_months: input.tenureMonths ?? 0,
          ltv: input.ltv ?? 0,
          total_income: input.totalIncome ?? 0,
          notes: input.notes ?? null,
        });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        id: z.number(),
        clientName: z.string().optional(),
        package: z.string().optional(),
        monthlyAmount: z.number().optional(),
        signedDate: z.string().nullable().optional(),
        status: z.enum(["active", "churned"]).optional(),
        tenureMonths: z.number().optional(),
        ltv: z.number().optional(),
        totalIncome: z.number().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "clients", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const { id, clientName, monthlyAmount, signedDate, tenureMonths, totalIncome, notes, package: pkg, status } = input;
        await supabase
          .from(`${slug}_client_roster`)
          .update({
            ...(clientName !== undefined && { client_name: clientName }),
            ...(pkg !== undefined && { package: pkg }),
            ...(monthlyAmount !== undefined && { monthly_amount: monthlyAmount }),
            ...(signedDate !== undefined && { signed_date: signedDate }),
            ...(status !== undefined && { status }),
            ...(tenureMonths !== undefined && { tenure_months: tenureMonths }),
            ...(totalIncome !== undefined && { total_income: totalIncome }),
            ...(notes !== undefined && { notes }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional(), id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "clients", input.tenantSlug);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        await deleteClientRosterEntry(slug, input.id);
        return { success: true };
      }),
  }),

  aiSummary: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        return getAiSummary(slug, input.year, input.month);
      }),
    generate: adminProcedure
      .input(z.object({ tenantSlug: z.string(), year: z.number(), month: z.number() }))
      .mutation(async ({ input }) => {
        const financialData = await getFinancials(input.tenantSlug, input.year, input.month);
        const lineItemData = await getLineItems(input.tenantSlug, input.year, input.month);
        const fin = financialData[0];
        const prompt = `You are a financial advisor for KynLi Consulting. Generate a concise, professional monthly financial summary for a client based on the following data:
Month: ${input.month}/${input.year}
${fin ? `Revenue: $${fin.revenue}, Expenses: $${fin.expenses}, Net Profit: $${fin.net_profit}, Margin: ${(fin.net_profit_margin * 100).toFixed(1)}%` : "No financial data available."}
Top Income Sources: ${lineItemData.filter(i => i.type === "income").slice(0, 5).map(i => `${i.label}: $${i.amount}`).join(", ") || "None"}
Top Expenses: ${lineItemData.filter(i => i.type === "expense").slice(0, 5).map(i => `${i.label}: $${i.amount}`).join(", ") || "None"}
Write a 3-4 paragraph summary covering: overall performance, key highlights, areas of concern, and one actionable recommendation. Use clear, non-technical language suitable for a business owner.`;
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a professional financial advisor writing client summaries." },
            { role: "user", content: prompt },
          ],
        });
        const rawContent = response.choices[0]?.message?.content;
         const content = typeof rawContent === "string" ? rawContent : "Summary unavailable.";
        await upsertAiSummary(input.tenantSlug, input.year, input.month, content);
        return { success: true, content };
      }),
  }),

  // ─── Chat ─────────────────────────────────────────────────────────────────
  chat: router({
    assignments: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        if (STAFF_PORTAL_ROLES.has(ctx.user.role)) {
          const assignments = await getStaffAssignments(ctx.user.id);
          const wantedSlug = input.tenantSlug ? sanitizeTenantSlug(input.tenantSlug) : null;
          const filtered = wantedSlug
            ? assignments.filter((a) => sanitizeTenantSlug(a.tenant_slug) === wantedSlug)
            : assignments;

          const tenantSlugs = Array.from(new Set(filtered.map((a) => sanitizeTenantSlug(a.tenant_slug))));
          let tenantRows: Array<{ slug: string; company_name: string | null; contact_name: string | null; email: string | null }> = [];
          if (tenantSlugs.length) {
            const { data, error } = await supabase
              .from("portal_tenants")
              .select("slug, company_name, contact_name, email")
              .in("slug", tenantSlugs);
            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
            tenantRows = (data || []) as Array<{ slug: string; company_name: string | null; contact_name: string | null; email: string | null }>;
          }
          const tenantBySlug = new Map(tenantRows.map((t) => [sanitizeTenantSlug(t.slug), t]));

          const mapped = filtered.map((a) => {
            const safeSlug = sanitizeTenantSlug(a.tenant_slug);
            const t = tenantBySlug.get(safeSlug);
            const clientDisplayName = t?.contact_name?.trim() || t?.email?.trim() || t?.company_name?.trim() || safeSlug;
            return {
              assignmentId: Number(a.id),
              tenantSlug: safeSlug,
              staffId: Number(a.staff_id),
              name: ctx.user.name ?? ctx.user.email ?? "Assigned Accountant",
              email: ctx.user.email ?? null,
              role: ctx.user.role,
              clientDisplayName,
            };
          });

          return mapped;
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const safeSlug = sanitizeTenantSlug(slug);

        // Client/admin view: list all assigned staff lanes for this tenant
        const { data: rows, error } = await supabase
          .from("staff_client_assignments")
          .select("id, staff_id, tenant_slug")
          .eq("tenant_slug", safeSlug)
          .order("assigned_at", { ascending: true });
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

        const assignmentRows = (rows || []) as Array<{ id: number; staff_id: number; tenant_slug: string }>;

        const staffIds = Array.from(new Set(assignmentRows.map((r) => Number(r.staff_id)).filter((n) => Number.isFinite(n))));

        let users: Array<{ id: number; name: string | null; email: string; role: string }> = [];
        if (staffIds.length) {
          const { data: userRows, error: usersErr } = await supabase
            .from("portal_users")
            .select("id, name, email, role")
            .in("id", staffIds);
          if (usersErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: usersErr.message });
          users = (userRows || []) as Array<{ id: number; name: string | null; email: string; role: string }>;
        }

        const byId = new Map(users.map((u) => [Number(u.id), u]));
        const mapped = assignmentRows.map((a) => {
          const u = byId.get(Number(a.staff_id));
          return {
            assignmentId: Number(a.id),
            tenantSlug: safeSlug,
            staffId: Number(a.staff_id),
            name: u?.name ?? u?.email ?? `Accountant #${a.staff_id}`,
            email: u?.email ?? null,
            role: u?.role ?? "accountant",
          };
        });

        return mapped;
      }),

    mentionCandidates: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        q: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const safeSlug = sanitizeTenantSlug(slug);
        await resolveChatAssignmentIdForUser(ctx.user, safeSlug, input.assignmentId);

        if (safeSlug === sanitizeTenantSlug(INTERNAL_CHAT_TENANT_SLUG)) {
          const { data: internalUsers, error: internalErr } = await supabase
            .from("portal_users")
            .select("id,name,email,role")
            .in("role", ["admin", "accounting_manager", "tax_manager", "accountant"])
            .order("name", { ascending: true });
          if (internalErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: internalErr.message });
          const q = input.q?.trim().toLowerCase() ?? "";
          return ((internalUsers || []) as Array<{ id:number; name:string|null; email:string; role:string }>).map((u) => ({
            id: Number(u.id),
            displayName: (u.name || u.email || `User ${u.id}`).trim(),
            email: u.email || null,
            role: u.role || null,
            source: "internal" as const,
            initials: ((u.name || u.email || "?").trim().charAt(0) || "?").toUpperCase(),
            assignmentId: null,
          })).filter((c)=> !q || c.displayName.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false));
        }

        const [tenantMembers, assignmentLanes] = await Promise.all([
          listTenantMembers(safeSlug),
          (async () => {
            const { data, error } = await supabase
              .from("staff_client_assignments")
              .select("id, staff_id, tenant_slug")
              .eq("tenant_slug", safeSlug)
              .order("assigned_at", { ascending: true });
            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
            return (data || []) as Array<{ id: number; staff_id: number; tenant_slug: string }>;
          })(),
        ]);

        const userMap = new Map<number, { id: number; name: string | null; email: string; role: string; source: string }>();

        for (const m of tenantMembers) {
          userMap.set(Number(m.id), {
            id: Number(m.id),
            name: m.name ?? null,
            email: m.email,
            role: m.role,
            source: m.source,
          });
        }

        // Ensure assigned internal/accountants are present even if tenant user row is absent.
        const laneStaffIds = Array.from(new Set(assignmentLanes.map((a) => Number(a.staff_id)).filter((n) => Number.isFinite(n) && n > 0)));
        const missing = laneStaffIds.filter((id) => !userMap.has(id));
        if (missing.length) {
          const { data: rows, error } = await supabase
            .from("portal_users")
            .select("id,name,email,role")
            .in("id", missing);
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          for (const r of (rows || []) as Array<{ id: number; name: string | null; email: string; role: string }>) {
            userMap.set(Number(r.id), {
              id: Number(r.id),
              name: r.name ?? null,
              email: r.email,
              role: r.role,
              source: "staff_assignment",
            });
          }
        }

        const laneByStaff = new Map<number, number>();
        for (const a of assignmentLanes) {
          if (!laneByStaff.has(Number(a.staff_id))) {
            laneByStaff.set(Number(a.staff_id), Number(a.id));
          }
        }

        const onlineSet = await getRecentlyOnlineUserIds(Array.from(userMap.keys()));

        const query = input.q?.trim().toLowerCase() ?? "";

        const candidates = Array.from(userMap.values())
          .map((u) => {
            const lowerRole = String(u.role || "").toLowerCase();
            const tenantSource = String(u.source || "").toLowerCase();
            const type = ["accountant", "tax_manager", "accounting_manager", "admin"].includes(lowerRole)
              ? (lowerRole === "admin" ? "internal" : "accountant")
              : (lowerRole === "client"
                ? (tenantSource === "workspace_owner" ? "client" : "guest")
                : "internal");

            return {
              id: u.id,
              displayName: (u.name || u.email || `User ${u.id}`).trim(),
              email: u.email || null,
              role: u.role || null,
              source: type,
              initials: ((u.name || u.email || "?").trim().charAt(0) || "?").toUpperCase(),
              assignmentId: laneByStaff.get(u.id) ?? null,
              isOnline: onlineSet.has(Number(u.id)),
            };
          })
          .filter((c) => {
            if (input.assignmentId != null && !(c.assignmentId == null || Number(c.assignmentId) === Number(input.assignmentId))) {
              return false;
            }
            if (!query) return true;
            return (
              c.displayName.toLowerCase().includes(query) ||
              (c.email?.toLowerCase().includes(query) ?? false)
            );
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        return candidates;
      }),

    peopleSearch: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        q: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (!(STAFF_PORTAL_ROLES.has(ctx.user.role) || ctx.user.role === "admin")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "People search is restricted." });
        }

        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const safeSlug = sanitizeTenantSlug(slug);
        await resolveChatAssignmentIdForUser(ctx.user, safeSlug, undefined);

        if (safeSlug === sanitizeTenantSlug(INTERNAL_CHAT_TENANT_SLUG)) {
          const q = input.q?.trim().toLowerCase() ?? "";

          // Admin: global people search across ALL portal user roles.
          if (ctx.user.role === "admin") {
            const { data: allUsers, error: allErr } = await supabase
              .from("portal_users")
              .select("id,name,email,role,tenant_slug")
              .order("name", { ascending: true });
            if (allErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: allErr.message });

            const slugs = Array.from(
              new Set(
                ((allUsers || []) as Array<{ tenant_slug: string | null }>)
                  .map((u) => sanitizeTenantSlug(u.tenant_slug))
                  .filter(Boolean)
              )
            );

            let tenantNameBySlug = new Map<string, string>();
            if (slugs.length) {
              const { data: tenants, error: tenantErr } = await supabase
                .from("portal_tenants")
                .select("slug,company_name")
                .in("slug", slugs);
              if (tenantErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: tenantErr.message });
              tenantNameBySlug = new Map(
                ((tenants || []) as Array<{ slug: string; company_name: string }>).map((t) => [sanitizeTenantSlug(t.slug), t.company_name])
              );
            }

            const merged = new Map<number, any>();
            for (const u of (allUsers || []) as Array<{ id:number; name:string|null; email:string; role:string; tenant_slug:string|null }>) {
              const id = Number(u.id);
              if (!Number.isFinite(id) || id <= 0) continue;
              if (merged.has(id)) continue;
              const tenantSlug = sanitizeTenantSlug(u.tenant_slug);
              merged.set(id, {
                id,
                displayName: (u.name || u.email || `User ${u.id}`).trim(),
                email: u.email || null,
                role: u.role || null,
                source: u.role === "client" ? "client" : "internal",
                initials: ((u.name || u.email || "?").trim().charAt(0) || "?").toUpperCase(),
                assignmentId: null as number | null,
                tenantSlug,
                tenantName: tenantSlug ? (tenantNameBySlug.get(tenantSlug) || null) : null,
              });
            }

            return Array.from(merged.values()).filter((c) => {
              if (!q) return true;
              return c.displayName.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false);
            });
          }

          // Non-admin behavior unchanged: internal staff only in internal chat context.
          const { data: internalUsers, error: internalErr } = await supabase
            .from("portal_users")
            .select("id,name,email,role")
            .in("role", ["admin", "accounting_manager", "tax_manager", "accountant"])
            .order("name", { ascending: true });
          if (internalErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: internalErr.message });

          const internal = ((internalUsers || []) as Array<{ id:number; name:string|null; email:string; role:string }>).map((u) => ({
            id: Number(u.id),
            displayName: (u.name || u.email || `User ${u.id}`).trim(),
            email: u.email || null,
            role: u.role || null,
            source: "internal" as const,
            initials: ((u.name || u.email || "?").trim().charAt(0) || "?").toUpperCase(),
            assignmentId: null as number | null,
            tenantSlug: null as string | null,
            tenantName: null as string | null,
          }));

          return internal.filter((c)=> !q || c.displayName.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false));
        }

        // Admin-only enhancement in tenant branch: global people search across all portal users.
        if (ctx.user.role === "admin") {
          const query = input.q?.trim().toLowerCase() ?? "";

          const { data: allUsers, error: allErr } = await supabase
            .from("portal_users")
            .select("id,name,email,role,tenant_slug")
            .order("name", { ascending: true });
          if (allErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: allErr.message });

          const userIds = Array.from(new Set(((allUsers || []) as Array<{ id: number }>).map((u) => Number(u.id)).filter((n) => Number.isFinite(n) && n > 0)));
          let workspaceLinks: Array<{ portal_user_id: number; tenant_slug: string; is_primary: boolean | null; created_at: string | null }> = [];
          if (userIds.length) {
            const { data: links, error: linksErr } = await supabase
              .from("client_workspace_access")
              .select("portal_user_id,tenant_slug,is_primary,created_at")
              .in("portal_user_id", userIds)
              .is("deleted_at", null);
            if (linksErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: linksErr.message });
            workspaceLinks = (links || []) as Array<{ portal_user_id: number; tenant_slug: string; is_primary: boolean | null; created_at: string | null }>;
          }

          const preferredTenantByUser = new Map<number, string>();
          for (const row of workspaceLinks) {
            const uid = Number(row.portal_user_id);
            const slug = sanitizeTenantSlug(row.tenant_slug);
            if (!uid || !slug) continue;
            const existing = preferredTenantByUser.get(uid);
            if (!existing) {
              preferredTenantByUser.set(uid, slug);
              continue;
            }
            if (row.is_primary) preferredTenantByUser.set(uid, slug);
          }

          const slugs = Array.from(
            new Set(
              ((allUsers || []) as Array<{ id:number; tenant_slug:string | null }>)
                .map((u) => sanitizeTenantSlug(u.tenant_slug) || preferredTenantByUser.get(Number(u.id)) || "")
                .filter(Boolean)
            )
          );

          let tenantNameBySlug = new Map<string, string>();
          if (slugs.length) {
            const { data: tenants, error: tenantErr } = await supabase
              .from("portal_tenants")
              .select("slug,company_name")
              .in("slug", slugs);
            if (tenantErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: tenantErr.message });
            tenantNameBySlug = new Map(((tenants || []) as Array<{ slug: string; company_name: string }>).map((t) => [sanitizeTenantSlug(t.slug), t.company_name]));
          }

          const mapped = ((allUsers || []) as Array<{ id:number; name:string | null; email:string; role:string; tenant_slug:string | null }>)
            .map((u) => {
              const tenantSlug = sanitizeTenantSlug(u.tenant_slug) || preferredTenantByUser.get(Number(u.id)) || null;
              return {
                id: Number(u.id),
                displayName: (u.name || u.email || `User ${u.id}`).trim(),
                email: u.email || null,
                role: u.role || null,
                source: u.role === "client" ? ("client" as const) : ("internal" as const),
                initials: ((u.name || u.email || "?").trim().charAt(0) || "?").toUpperCase(),
                assignmentId: null as number | null,
                tenantSlug,
                tenantName: tenantSlug ? (tenantNameBySlug.get(tenantSlug) || null) : null,
              };
            })
            .filter((c) => {
              if (!query) return true;
              return c.displayName.toLowerCase().includes(query) || (c.email?.toLowerCase().includes(query) ?? false);
            })
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

          const deduped = new Map<number, (typeof mapped)[number]>();
          for (const row of mapped) {
            if (!Number.isFinite(row.id) || row.id <= 0) continue;
            if (!deduped.has(row.id)) deduped.set(row.id, row);
          }
          return Array.from(deduped.values());
        }

        const [tenantMembers, assignmentLanes] = await Promise.all([
          listTenantMembers(safeSlug),
          (async () => {
            const { data, error } = await supabase
              .from("staff_client_assignments")
              .select("id, staff_id, tenant_slug")
              .eq("tenant_slug", safeSlug)
              .order("assigned_at", { ascending: true });
            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
            return (data || []) as Array<{ id: number; staff_id: number; tenant_slug: string }>;
          })(),
        ]);

        const userMap = new Map<number, { id: number; name: string | null; email: string; role: string; source: string }>();
        for (const m of tenantMembers) {
          userMap.set(Number(m.id), {
            id: Number(m.id),
            name: m.name ?? null,
            email: m.email,
            role: m.role,
            source: m.source,
          });
        }

        const laneStaffIds = Array.from(new Set(assignmentLanes.map((a) => Number(a.staff_id)).filter((n) => Number.isFinite(n) && n > 0)));
        const missing = laneStaffIds.filter((id) => !userMap.has(id));
        if (missing.length) {
          const { data: rows, error } = await supabase
            .from("portal_users")
            .select("id,name,email,role")
            .in("id", missing);
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          for (const r of (rows || []) as Array<{ id: number; name: string | null; email: string; role: string }>) {
            userMap.set(Number(r.id), {
              id: Number(r.id),
              name: r.name ?? null,
              email: r.email,
              role: r.role,
              source: "staff_assignment",
            });
          }
        }

        const laneByStaff = new Map<number, number>();
        for (const a of assignmentLanes) {
          if (!laneByStaff.has(Number(a.staff_id))) laneByStaff.set(Number(a.staff_id), Number(a.id));
        }

        const onlineSet = await getRecentlyOnlineUserIds(Array.from(userMap.keys()));

        const query = input.q?.trim().toLowerCase() ?? "";
        return Array.from(userMap.values())
          .map((u) => {
            const lowerRole = String(u.role || "").toLowerCase();
            const tenantSource = String(u.source || "").toLowerCase();
            const type = ["accountant", "tax_manager", "accounting_manager", "admin"].includes(lowerRole)
              ? (lowerRole === "admin" ? "internal" : "accountant")
              : (lowerRole === "client"
                ? (tenantSource === "workspace_owner" ? "client" : "guest")
                : "internal");
            return {
              id: u.id,
              displayName: (u.name || u.email || `User ${u.id}`).trim(),
              email: u.email || null,
              role: u.role || null,
              source: type,
              initials: ((u.name || u.email || "?").trim().charAt(0) || "?").toUpperCase(),
              assignmentId: laneByStaff.get(u.id) ?? null,
              isOnline: onlineSet.has(Number(u.id)),
            };
          })
          .filter((c) => !query || c.displayName.toLowerCase().includes(query) || (c.email?.toLowerCase().includes(query) ?? false))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
      }),

    resolveDm: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        peerUserId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(STAFF_PORTAL_ROLES.has(ctx.user.role) || ctx.user.role === "admin")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "DM is restricted." });
        }
        const currentUserId = normalizeUserId(ctx.user.id);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const safeSlug = sanitizeTenantSlug(slug);
        const peerUserId = normalizeUserId(input.peerUserId);

        const allowed = await canUsePeerForDm(ctx.user, peerUserId, safeSlug);
        if (!allowed) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Peer is not allowed for DM in this scope." });
        }

        const dmKey = makeDmKey(currentUserId, peerUserId);
        return {
          dmKey,
          laneKey: `dm:${dmKey}`,
          peerUserId,
          tenantSlug: safeSlug,
        };
      }),

    dmConversations: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const userId = normalizeUserId(ctx.user.id);
        const wantedTenant = input?.tenantSlug ? sanitizeTenantSlug(input.tenantSlug) : undefined;

        // Resolve which tenant scopes this user can access for DM discovery.
        const allowedTenantSlugs = isInternalChatSlug(wantedTenant)
          ? [sanitizeTenantSlug(INTERNAL_CHAT_TENANT_SLUG)]
          : await resolveTenantSlugsForUser(ctx.user, wantedTenant, ctx.clientWorkspaceTenantSlug);

        const chunks = await Promise.all(
          allowedTenantSlugs.map((slug) => listDmConversationsForUser({ userId, tenantSlug: slug }))
        );

        const merged = new Map<string, any>();
        for (const row of chunks.flat()) {
          if (!row?.dmKey) continue;
          const existing = merged.get(row.dmKey);
          if (!existing) {
            merged.set(row.dmKey, row);
            continue;
          }

          const prevTs = new Date(existing.lastMessageAt || 0).getTime();
          const nextTs = new Date(row.lastMessageAt || 0).getTime();
          if (nextTs > prevTs) {
            merged.set(row.dmKey, {
              ...row,
              unreadCount: Math.max(Number(existing.unreadCount || 0), Number(row.unreadCount || 0)),
            });
          } else {
            merged.set(row.dmKey, {
              ...existing,
              unreadCount: Math.max(Number(existing.unreadCount || 0), Number(row.unreadCount || 0)),
            });
          }
        }

        const result = Array.from(merged.values()).sort(
          (a, b) => new Date(String(b.lastMessageAt || 0)).getTime() - new Date(String(a.lastMessageAt || 0)).getTime()
        );

        return result;
      }),

    // List recent messages for the tenant's room (top-level only)
    list: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        limit: z.number().min(1).max(500).default(200),
        beforeId: z.number().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        if (!isInternalChatSlug(slug)) {
          const tenant = await getTenantBySlug(slug);
          if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        }

        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          return getChatMessages(slug, input.limit, input.beforeId, input.search, undefined, false, input.dmKey, visibilityScope);
        }

        const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
        return getChatMessages(slug, input.limit, input.beforeId, input.search, scope.assignmentId, scope.assignmentNullOnly, undefined, visibilityScope);
      }),

    markRead: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        lastReadMessageId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);

        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          await upsertChatReadState({
            userId: currentUserId,
            tenantSlug: slug,
            dmKey: input.dmKey,
            lastReadMessageId: input.lastReadMessageId ?? null,
            lastReadAt: new Date().toISOString(),
          });
          return { success: true };
        }

        const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
        await upsertChatReadState({
          userId: currentUserId,
          tenantSlug: slug,
          assignmentId: scope.assignmentId,
          lastReadMessageId: input.lastReadMessageId ?? null,
          lastReadAt: new Date().toISOString(),
        });
        return { success: true };
      }),

    unreadSummary: protectedProcedure
      .input(z.object({
        viewAsClient: z.boolean().optional(),
        lanes: z.array(z.object({
          key: z.string().min(1),
          tenantSlug: z.string().optional(),
          assignmentId: z.number().nullable().optional(),
          dmKey: z.string().nullable().optional(),
          visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        })).max(200),
      }))
      .query(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const out: Record<string, number> = {};

        for (const lane of input.lanes) {
          try {
            const visibilityScope = resolveVisibilityScope(lane.visibilityScope);
            assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
            const slug = await resolveChatTenantSlug(ctx.user, lane.tenantSlug);

            if (lane.dmKey) {
              await assertDmAccess(currentUserId, lane.dmKey);
              out[lane.key] = await getChatUnreadCount({
                userId: currentUserId,
                tenantSlug: slug,
                dmKey: lane.dmKey,
                visibilityScope,
              });
              continue;
            }

            const scope = await resolveChatAssignmentIdForUser(
              ctx.user,
              slug,
              lane.assignmentId == null ? undefined : Number(lane.assignmentId),
            );

            out[lane.key] = await getChatUnreadCount({
              userId: currentUserId,
              tenantSlug: slug,
              assignmentId: scope.assignmentId,
              assignmentNullOnly: scope.assignmentNullOnly,
              visibilityScope,
            });
          } catch {
            // inaccessible/invalid lanes are treated as zero unread
            out[lane.key] = 0;
          }
        }

        return out;
      }),

    // Fetch all replies for a thread (parent message)
    getThread: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        parentId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);

        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          return getThreadReplies(slug, input.parentId, undefined, false, input.dmKey, visibilityScope);
        }

        const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
        return getThreadReplies(slug, input.parentId, scope.assignmentId, scope.assignmentNullOnly, undefined, visibilityScope);
      }),

    // Send a text message (Phase 1 global chat table)
    send: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        body: z.string().min(1).max(4000),
        replyToMessageId: z.number().optional(),
        replyToSenderName: z.string().optional(),
        replyToMessagePreview: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const tenant = isInternalChatSlug(slug) ? null : await getTenantBySlug(slug);
        if (!isInternalChatSlug(slug) && !tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

        try {
          let dmKey: string | null = null;
          let assignmentId: number | null = null;
          if (input.dmKey) {
            await assertDmAccess(currentUserId, input.dmKey);
            dmKey = input.dmKey;
          } else {
            const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
            assignmentId = scope.assignmentId;
          }

          const msg = await insertGlobalChatTextMessage({
            tenant_slug: slug,
            assignment_id: assignmentId,
            dm_key: dmKey,
            organization_id: tenant?.id != null ? String(tenant.id) : null,
            sender_user_id: ctx.user.id != null ? String(ctx.user.id) : null,
            sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
            sender_role: ctx.user.role === "admin" ? "admin" : "client",
            message_text: input.body,
            visibility_scope: visibilityScope,
            reply_to_message_id: input.replyToMessageId ?? null,
            reply_to_sender_name: input.replyToSenderName ?? null,
            reply_to_message_preview: input.replyToMessagePreview ?? null,
          });

          const messageId = Number((msg as any).id);
          const messageText = String((msg as any).message ?? input.body ?? "");

          await writeActivityLog({
            req: ctx.req,
            actor: ctx.user,
            action_type: "message_sent",
            entity_type: "chat_message",
            entity_id: String(messageId),
            tenant_slug: slug,
            organization_id: tenant?.id != null ? String(tenant.id) : null,
            file_name: null,
            metadata: {
              conversation_id: buildConversationId({ tenantSlug: slug, assignmentId, dmKey }),
              thread_id: null,
              assignment_id: assignmentId,
              dm_key: dmKey,
              related_message_id: messageId,
              message_preview: toMessagePreview(messageText),
              message_length: messageText.length,
              attachment_count: 0,
              source: "chat",
            },
            status: "success",
          });

          if (visibilityScope === "workspace_public") {
            await createMentionNotifications({
              req: ctx.req,
              actor: ctx.user,
              tenantSlug: slug,
              tenantName: tenant?.company_name ?? null,
              assignmentId,
              dmKey,
              messageId,
              body: input.body,
            }).catch((err) => {
              console.error("[chat.send] mention notification failed", {
                tenantSlug: slug,
                messageId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }

          return msg;
        } catch (error) {
          console.error("[chat.send] global insert failed", {
            tenantSlug: slug,
            senderUserId: ctx.user.id ?? null,
            senderRole: ctx.user.role,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to send chat message",
          });
        }
      }),

    // Reply to a thread (sets thread_id to parent message id)
    sendReply: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        parentId: z.number(),
        body: z.string().min(1).max(4000),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const tenant = isInternalChatSlug(slug) ? null : await getTenantBySlug(slug);
        if (!isInternalChatSlug(slug) && !tenant) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        }

        let dmKey: string | null = null;
        let assignmentId: number | null = null;
        let assignmentNullOnly = false;
        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          dmKey = input.dmKey;
        } else {
          const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
          assignmentId = scope.assignmentId;
          assignmentNullOnly = scope.assignmentNullOnly;
        }

        const reply = await insertGlobalChatTextMessage({
          tenant_slug: slug,
          assignment_id: assignmentId,
          dm_key: dmKey,
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          sender_user_id: ctx.user.id != null ? String(ctx.user.id) : null,
          sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
          sender_role: ctx.user.role === "admin" ? "admin" : "client",
          message_text: input.body,
          visibility_scope: visibilityScope,
          parent_message_id: input.parentId,
          thread_id: input.parentId,
          reply_count: 0,
        });

        const messageId = Number((reply as any).id);
        const messageText = String((reply as any).message ?? input.body ?? "");

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "message_sent",
          entity_type: "chat_message",
          entity_id: String(messageId),
          tenant_slug: slug,
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          metadata: {
            conversation_id: buildConversationId({ tenantSlug: slug, assignmentId, dmKey }),
            thread_id: input.parentId,
            assignment_id: assignmentId,
            dm_key: dmKey,
            related_message_id: messageId,
            message_preview: toMessagePreview(messageText),
            message_length: messageText.length,
            attachment_count: 0,
            source: "chat",
          },
          status: "success",
        });

        if (visibilityScope === "workspace_public") {
          await createMentionNotifications({
            req: ctx.req,
            actor: ctx.user,
            tenantSlug: slug,
            tenantName: tenant?.company_name ?? null,
            assignmentId,
            dmKey,
            messageId,
            parentId: input.parentId,
            body: input.body,
          }).catch((err) => {
            console.error("[chat.sendReply] mention notification failed", {
              tenantSlug: slug,
              messageId,
              parentId: input.parentId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        // Increment reply count on parent (non-blocking)
        await incrementReplyCount(slug, input.parentId, assignmentId, assignmentNullOnly, dmKey).catch(() => {});
        return reply;
      }),

    // Reply to a thread with a file attachment (legacy thread-safe path)
    sendReplyFile: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        parentId: z.number(),
        body: z.string().optional(),
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const tenant = isInternalChatSlug(slug) ? null : await getTenantBySlug(slug);
        if (!isInternalChatSlug(slug) && !tenant) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        }

        let dmKey: string | null = null;
        let assignmentId: number | null = null;
        let assignmentNullOnly = false;
        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          dmKey = input.dmKey;
        } else {
          const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
          assignmentId = scope.assignmentId;
          assignmentNullOnly = scope.assignmentNullOnly;
        }

        const now = new Date();
        const archiveYear = now.getFullYear();
        const archiveMonth = now.getMonth() + 1;

        const ext = input.mimeType.split("/")[1]
          ?.replace("vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx")
          .replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx") || "bin";
        const safeDocType = "chat_attachment";
        const safeYear = String(archiveYear);
        const safeMonth = String(archiveMonth).padStart(2, "0");
        const timestamp = Date.now();
        const rand = Math.random().toString(36).slice(2);
        const originalFileName = input.fileName || `attachment-${timestamp}.${ext}`;
        const sanitizedFileName = sanitizeStorageFileName(originalFileName, ext);
        const fileKey = `${slug}/${safeDocType}/${safeYear}/${safeMonth}/${timestamp}-${rand}-${sanitizedFileName}`;

        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.mimeType);

        // Best-effort archive into documents vault
        try {
          await insertDocument(slug, {
            organization_id: tenant?.id != null ? String(tenant.id) : null,
            client_id: null,
            name: input.fileName,
            description: `Shared via thread by ${ctx.user.name ?? ctx.user.email ?? "Unknown"}`,
            doc_type: "chat_attachment",
            file_key: fileKey,
            file_url: fileUrl,
            file_name: input.fileName,
            file_size: input.fileSize,
            mime_type: input.mimeType,
            year: archiveYear,
            month: archiveMonth,
            uploaded_by_name: ctx.user.name ?? ctx.user.email ?? null,
            uploaded_by_user_id: ctx.user.id ? String(ctx.user.id) : null,
          });
        } catch (archiveErr) {
          console.error("[chat.sendReplyFile] documents_metadata archive failed (non-blocking)", {
            slug,
            fileKey,
            fileName: input.fileName,
            error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
          });
        }

        const reply = await insertGlobalChatFileMessage({
          tenant_slug: slug,
          assignment_id: assignmentId,
          dm_key: dmKey,
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          sender_user_id: ctx.user.id != null ? String(ctx.user.id) : null,
          sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
          sender_role: ctx.user.role === "admin" ? "admin" : "client",
          message_text: input.body ?? null,
          visibility_scope: visibilityScope,
          file_url: fileUrl,
          file_key: fileKey,
          file_name: input.fileName,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          document_metadata_id: null,
          message_type: "file",
          parent_message_id: input.parentId,
          thread_id: input.parentId,
          reply_count: 0,
        });

        const messageId = Number((reply as any).id);
        const messageText = String((reply as any).message ?? input.body ?? "");

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "message_sent",
          entity_type: "chat_message",
          entity_id: String(messageId),
          tenant_slug: slug,
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          file_name: input.fileName,
          metadata: {
            conversation_id: buildConversationId({ tenantSlug: slug, assignmentId, dmKey }),
            thread_id: input.parentId,
            assignment_id: assignmentId,
            dm_key: dmKey,
            related_message_id: messageId,
            message_preview: toMessagePreview(messageText),
            message_length: messageText.length,
            attachment_count: 1,
            file_name: input.fileName,
            source: "chat",
          },
          status: "success",
        });

        if (visibilityScope === "workspace_public") {
          await createMentionNotifications({
            req: ctx.req,
            actor: ctx.user,
            tenantSlug: slug,
            tenantName: tenant?.company_name ?? null,
            assignmentId,
            dmKey,
            messageId,
            parentId: input.parentId,
            body: input.body,
          }).catch((err) => {
            console.error("[chat.sendReplyFile] mention notification failed", {
              tenantSlug: slug,
              messageId,
              parentId: input.parentId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        await incrementReplyCount(slug, input.parentId, assignmentId, assignmentNullOnly, dmKey).catch(() => {});
        return reply;
      }),

    // Upload a file attachment — saves to S3, archives to documents table, and records in chat
    sendFile: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        visibilityScope: z.enum(["workspace_public", "staff_only"]).optional(),
        viewAsClient: z.boolean().optional(),
        body: z.string().optional(), // optional caption
        fileBase64: z.string(), // base64-encoded file content
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
        replyToMessageId: z.number().optional(),
        replyToSenderName: z.string().optional(),
        replyToMessagePreview: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const visibilityScope = resolveVisibilityScope(input.visibilityScope);
        assertVisibilityScopeAccess(ctx.user, visibilityScope, input.viewAsClient === true);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const tenant = isInternalChatSlug(slug) ? null : await getTenantBySlug(slug);
        if (!isInternalChatSlug(slug) && !tenant) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        }

        let dmKey: string | null = null;
        let assignmentId: number | null = null;
        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          dmKey = input.dmKey;
        } else {
          const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
          assignmentId = scope.assignmentId;
        }

        const now = new Date();
        const archiveYear = now.getFullYear();
        const archiveMonth = now.getMonth() + 1;

        // Upload file bytes to documents storage
        const ext = input.mimeType.split("/")[1]
          ?.replace("vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx")
          .replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx") || "bin";
        const safeDocType = "chat_attachment";
        const safeYear = String(archiveYear);
        const safeMonth = String(archiveMonth).padStart(2, "0");
        const timestamp = Date.now();
        const rand = Math.random().toString(36).slice(2);
        const originalFileName = input.fileName || `attachment-${timestamp}.${ext}`;
        const sanitizedFileName = sanitizeStorageFileName(originalFileName, ext);
        const fileKey = `${slug}/${safeDocType}/${safeYear}/${safeMonth}/${timestamp}-${rand}-${sanitizedFileName}`;

        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.mimeType);

        // Auto-archive to global documents_metadata table (scoped by tenant_slug)
        let insertedDocMetadataId: string | null = null;
        let insertedDocIdForLegacyInt: number | null = null;
        try {
          const inserted = await insertDocument(slug, {
            organization_id: tenant?.id != null ? String(tenant.id) : null,
            client_id: null,
            name: input.fileName,
            description: `Shared via chat by ${ctx.user.name ?? ctx.user.email ?? "Unknown"}`,
            doc_type: "chat_attachment",
            file_key: fileKey,
            file_url: fileUrl,
            file_name: input.fileName,
            file_size: input.fileSize,
            mime_type: input.mimeType,
            year: archiveYear,
            month: archiveMonth,
            uploaded_by_name: ctx.user.name ?? ctx.user.email ?? null,
            uploaded_by_user_id: ctx.user.id ? String(ctx.user.id) : null,
          });
          if (inserted) {
            insertedDocMetadataId = inserted.id ?? null;
            // Legacy chat table column is INTEGER; documents_metadata.id is UUID.
            const parsedDocId = Number(inserted.id);
            insertedDocIdForLegacyInt = Number.isFinite(parsedDocId) ? parsedDocId : null;
          }
        } catch (archiveErr) {
          console.error("[chat.sendFile] documents_metadata archive failed (non-blocking for chat message)", {
            slug,
            fileKey,
            fileName: input.fileName,
            error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
          });
        }

        // Record in global chat table (portal_chat_messages)
        let msg;
        const chatInsertPayload = {
          tenant_slug: slug,
          assignment_id: assignmentId,
          dm_key: dmKey,
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          sender_user_id: ctx.user.id != null ? String(ctx.user.id) : null,
          sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
          sender_role: ctx.user.role === "admin" ? "admin" : "client",
          message_text: input.body ?? null,
          visibility_scope: visibilityScope,
          file_url: fileUrl,
          file_key: fileKey,
          file_name: input.fileName,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          document_metadata_id: insertedDocMetadataId,
          message_type: "file" as const,
          reply_to_message_id: input.replyToMessageId ?? null,
          reply_to_sender_name: input.replyToSenderName ?? null,
          reply_to_message_preview: input.replyToMessagePreview ?? null,
        };

        console.info("[chat.sendFile] global chat insert payload", {
          tableName: "portal_chat_messages",
          tenantSlug: slug,
          file_url: fileUrl,
          file_name: input.fileName,
          file_key: fileKey,
          document_metadata_id: insertedDocMetadataId,
          document_metadata_id_type: typeof insertedDocMetadataId,
          payload: chatInsertPayload,
        });

        try {
          msg = await insertGlobalChatFileMessage(chatInsertPayload);
        } catch (chatInsertErr) {
          const detail = chatInsertErr instanceof Error ? chatInsertErr.message : String(chatInsertErr);
          console.error("[chat.sendFile] global chat insert failed", {
            slug,
            fileKey,
            fileUrl,
            insertedDocMetadataId,
            insertedDocIdForLegacyInt,
            detail,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `File was uploaded to the vault, but creating the chat message failed: ${detail}`,
          });
        }

        // Notify admin if sender is a client
        if (ctx.user.role !== "admin") {
          const { notifyOwner } = await import("./_core/notification");
          await notifyOwner({
            title: `New file shared in chat — ${slug}`,
            content: `${ctx.user.name ?? ctx.user.email ?? "A client"} shared "${input.fileName}" in the ${slug} chat room. It has been auto-archived to the Portal vault under ${archiveMonth}/${archiveYear}.`,
          }).catch(() => {}); // non-blocking
        }

        const messageId = Number((msg as any).id);
        const messageText = String((msg as any).message ?? input.body ?? "");

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "message_sent",
          entity_type: "chat_message",
          entity_id: String(messageId),
          tenant_slug: slug,
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          file_name: input.fileName,
          metadata: {
            conversation_id: buildConversationId({ tenantSlug: slug, assignmentId, dmKey }),
            thread_id: null,
            assignment_id: assignmentId,
            dm_key: dmKey,
            related_message_id: messageId,
            message_preview: toMessagePreview(messageText),
            message_length: messageText.length,
            attachment_count: 1,
            file_name: input.fileName,
            source: "chat",
          },
          status: "success",
        });

        if (visibilityScope === "workspace_public") {
          await createMentionNotifications({
            req: ctx.req,
            actor: ctx.user,
            tenantSlug: slug,
            tenantName: tenant?.company_name ?? null,
            assignmentId,
            dmKey,
            messageId,
            body: input.body ?? null,
          }).catch((err) => {
            console.error("[chat.sendFile] mention notification failed", {
              tenantSlug: slug,
              messageId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        return msg;
      }),

    // Delete a message (sender or admin), global-first with legacy fallback
    delete: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        assignmentId: z.number().optional(),
        dmKey: z.string().optional(),
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentUserId = normalizeUserId(ctx.user.id);
        const slug = await resolveChatTenantSlug(ctx.user, input.tenantSlug);
        const tenant = isInternalChatSlug(slug) ? null : await getTenantBySlug(slug);
        if (!isInternalChatSlug(slug) && !tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

        let dmKey: string | null = null;
        let assignmentId: number | null = null;
        let assignmentNullOnly = false;
        if (input.dmKey) {
          await assertDmAccess(currentUserId, input.dmKey);
          dmKey = input.dmKey;
        } else {
          const scope = await resolveChatAssignmentIdForUser(ctx.user, slug, input.assignmentId);
          assignmentId = scope.assignmentId;
          assignmentNullOnly = scope.assignmentNullOnly;
        }

        // Global-first delete path
        const globalMsg = await getGlobalChatMessageById(slug, input.id, assignmentId, assignmentNullOnly, dmKey).catch(() => null);

        if (globalMsg) {
          const senderUserId = globalMsg.sender_user_id != null ? Number(globalMsg.sender_user_id) : null;
          const isOwner = senderUserId != null && ctx.user.id != null && senderUserId === ctx.user.id;
          const isAdminRole = ctx.user.role === "admin";

          if (!isOwner && !isAdminRole) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own messages." });
          }

          const result = await deleteGlobalChatMessage(slug, input.id, assignmentId, assignmentNullOnly, dmKey);

          await writeActivityLog({
            req: ctx.req,
            actor: ctx.user,
            action_type: "message_deleted",
            entity_type: "chat_message",
            entity_id: String(input.id),
            tenant_slug: slug,
            organization_id: tenant?.id != null ? String(tenant.id) : null,
            previous_value: toMessagePreview((globalMsg as any).message_text ?? null),
            metadata: {
              conversation_id: buildConversationId({ tenantSlug: slug, assignmentId, dmKey }),
              thread_id: globalMsg.thread_id ?? null,
              assignment_id: assignmentId,
              dm_key: dmKey,
              deleted_message_id: Number(input.id),
              message_preview: toMessagePreview((globalMsg as any).message_text ?? null),
              message_length: String((globalMsg as any).message_text ?? "").length,
              attachment_count: globalMsg.file_url ? 1 : 0,
              source: "chat",
            },
            status: "success",
          });

          if (result.parentId != null) {
            await decrementReplyCount(slug, result.parentId, assignmentId, assignmentNullOnly, dmKey).catch(() => {});
          }

          return {
            success: true,
            source: "global",
            cascadeDeleted: result.cascadeDeleted,
          };
        }

        // Legacy fallback path only for shared (non-assignment-scoped/non-DM) conversations.
        if (dmKey || assignmentId != null || assignmentNullOnly) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found in conversation scope" });
        }
        await deleteChatMessageSupabase(slug, input.id);
        return { success: true, source: "legacy", cascadeDeleted: 0 };
      }),
  }),
  // ─── Staff / Team Management ───────────────────────────────────────────────
  staff: router({
    list: adminProcedure.query(async () => listStaff()),

    roles: adminProcedure.query(async () =>
      STAFF_ROLES.map((r) => ({ value: r, label: STAFF_ROLE_LABELS[r] }))
    ),

    invite: adminProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(["admin", "accounting_manager", "tax_manager", "accountant"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const created = await createStaffMember({ email: input.email, name: input.name, role: input.role as StaffRole });

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "user_invited",
          entity_type: "user",
          entity_id: created?.id != null ? String(created.id) : null,
          new_value: input.email,
          metadata: {
            invited_name: input.name,
            invited_role: input.role,
            source: "staff.invite",
          },
          status: "success",
        });

        return created;
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        role: z.enum(["admin", "accounting_manager", "tax_manager", "accountant"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const updated = await updateStaffMember(id, updates as Partial<{ name: string; role: StaffRole }>);

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "role_changed",
          entity_type: "user",
          entity_id: String(id),
          previous_value: null,
          new_value: updates.role ?? null,
          metadata: {
            updated_name: updates.name ?? null,
            updated_role: updates.role ?? null,
            source: "staff.update",
          },
          status: "success",
        });

        return updated;
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeStaffMember(input.id);

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "member_removed",
          entity_type: "user",
          entity_id: String(input.id),
          metadata: {
            source: "staff.remove",
          },
          status: "success",
        });

        return { success: true };
      }),

    getAssignments: adminProcedure
      .input(z.object({ staffId: z.number() }))
      .query(async ({ input }) => getStaffAssignments(input.staffId)),

    assignClient: adminProcedure
      .input(z.object({ staffId: z.number(), tenantSlug: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assignStaffToClient(input.staffId, input.tenantSlug);

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "member_added",
          entity_type: "user",
          entity_id: String(input.staffId),
          tenant_slug: input.tenantSlug,
          metadata: {
            source: "staff.assign_client",
          },
          status: "success",
        });

        return { success: true };
      }),

    unassignClient: adminProcedure
      .input(z.object({ staffId: z.number(), tenantSlug: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await unassignStaffFromClient(input.staffId, input.tenantSlug);

        await writeActivityLog({
          req: ctx.req,
          actor: ctx.user,
          action_type: "member_removed",
          entity_type: "user",
          entity_id: String(input.staffId),
          tenant_slug: input.tenantSlug,
          metadata: {
            source: "staff.unassign_client",
          },
          status: "success",
        });

        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
