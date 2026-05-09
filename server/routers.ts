import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { PACKAGE_TIERS, TAB_ACCESS, type PackageTier } from "../shared/tiers";
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
  getCoachingItems,
  getDocuments,
  insertDocument,
  deleteDocument,
  deleteDocuments,
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
  getThreadReplies,
  incrementReplyCount,
  insertChatMessageSupabase,
  insertGlobalChatTextMessage,
  insertGlobalChatFileMessage,
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
  inviteClientByEmail,
  markInviteAccepted,
  archiveTenant,
  restoreTenant,
  deleteTenant,
  sanitizeTenantSlug,
  backfillDocumentsOrganizationIds,
} from "./supabase";

// ─── Invite redirect helpers ─────────────────────────────────────────────────
const PROD_PORTAL_ORIGIN = "https://portal.kynliconsulting.com";

function getInviteRedirectTo(portalOrigin?: string): string {
  if (process.env.NODE_ENV === "production") {
    return `${PROD_PORTAL_ORIGIN}/auth/callback`;
  }

  const origin = (portalOrigin && portalOrigin.trim()) || "http://localhost:3000";
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

// ─── Admin guard middleware ───────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Tenant context helper ────────────────────────────────────────────────────
async function resolveTenantSlug(user: PortalUser, impersonateSlug?: string): Promise<string> {
  if (user.role === "admin" && impersonateSlug) return impersonateSlug;
  if (user.tenant_slug) return user.tenant_slug;
  throw new TRPCError({ code: "NOT_FOUND", message: "No tenant profile found for this user" });
}

async function authorizeDocumentDeleteScope(
  user: PortalUser,
  ids: Array<string | number>,
  tenantSlugOverride?: string,
): Promise<string> {
  const resolvedSlug = sanitizeTenantSlug(await resolveTenantSlug(user, tenantSlugOverride));
  const normalizedIds = ids.map((id) => String(id));

  const { data, error } = await supabase
    .from("documents_metadata")
    .select("id, tenant_slug, uploaded_by_user_id")
    .in("id", normalizedIds);

  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Unable to validate document ownership: ${error.message}` });
  }

  const rows = (data || []) as Array<{ id: string; tenant_slug: string; uploaded_by_user_id: string | null }>;
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

  return resolvedSlug;
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
        // Mark invite as accepted when client sets their password for the first time
        if (ctx.user.email) {
          await markInviteAccepted(ctx.user.email);
        }
        return { success: true };
      }),
  }),

  documentsAdmin: router({
    backfillOrganizationIds: adminProcedure
      .mutation(async () => {
        const result = await backfillDocumentsOrganizationIds();
        return { success: true, ...result };
      }),
  }),

  tenant: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.tenant_slug) return null;
      return getTenantBySlug(ctx.user.tenant_slug);
    }),
    getBySlug: adminProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => getTenantBySlug(input.slug)),
    list: adminProcedure.query(async () => getAllPortalTenants()),
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
        // Send magic-link invite if requested and email is provided
        let invite: { sent: boolean; error?: string } | null = null;
        if (input.sendInvite && input.email) {
          const redirectTo = getInviteRedirectTo(input.portalOrigin);
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getFinancials(slug, input.year, input.month);
      }),
    lineItems: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getLineItems(slug, input.year, input.month);
      }),
    lineItemsByYear: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getLineItemsByYear(slug, input.year);
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
    list: protectedProcedure
      .input(z.object({
        year: z.number().optional(),
        month: z.number().optional(),
        docType: z.string().optional(),
        tenantSlug: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getDocuments(slug, input.year, input.month, input.docType);
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
      }))
      .mutation(async ({ ctx, input }) => {
        const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "documents";

        let resolvedTenantSlug: string;
        try {
          resolvedTenantSlug = await resolveTenantSlug(ctx.user);
        } catch (error) {
          console.error("[documents.upload] unable to resolve tenant slug", {
            userId: ctx.user.id,
            userEmail: ctx.user.email,
            userTenantSlug: ctx.user.tenant_slug,
            rawTenantSlug: ctx.user.tenant_slug,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to resolve tenant slug for document upload.",
          });
        }

        console.info("[documents.upload] tenant slug resolution", {
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userTenantSlug: ctx.user.tenant_slug,
          rawTenantSlug: ctx.user.tenant_slug,
          resolvedTenantSlug,
        });

        const tenantSlug = sanitizeTenantSlug(resolvedTenantSlug);

        console.info("[documents.upload] tenant slug sanitized", {
          rawTenantSlug: resolvedTenantSlug,
          sanitizedTenantSlug: tenantSlug,
        });

        const tenantRecord = await getTenantBySlug(tenantSlug);
        const organizationId = tenantRecord?.id != null ? String(tenantRecord.id) : null;
        const uploadedByUserId = ctx.user.id != null ? String(ctx.user.id) : null;

        console.info("[documents.upload] tenant lookup result", {
          tenantSlug,
          tenantRecord,
        });

        if (!organizationId) {
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
        const supabasePath = `${tenantSlug}/${safeDocType}/${safeYear}/${safeMonth}/${timestamp}-${rand}-${sanitizedFileName}`;

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

          const fallbackKey = `docs/${tenantSlug}/${safeDocType}/${timestamp}-${rand}.${ext}`;
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
          name: input.name,
          description: input.description || null,
          doc_type: input.docType,
          file_key: fileKey,
          file_url: fileUrl,
          file_name: input.fileName || null,
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

        try {
          await insertDocument(tenantSlug, documentInsertPayload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[documents.upload] insertDocument failed", {
            tenantSlug,
            tableName: "documents_metadata",
            uploaded_by_name: ctx.user.name ?? ctx.user.email ?? null,
            fileKey,
            error: message,
          });

          if (message.includes("relation") || message.includes("does not exist") || message.includes("404")) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Document upload failed: documents_metadata table does not exist yet.",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Document upload failed while saving the document record: ${message}`,
          });
        }

        return { success: true, url: fileUrl };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.union([z.string(), z.number()]), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const authorizedSlug = await authorizeDocumentDeleteScope(ctx.user, [input.id], input.tenantSlug);
        await deleteDocument(authorizedSlug, input.id);
        return { success: true };
      }),
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.union([z.string(), z.number()])).min(1), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const authorizedSlug = await authorizeDocumentDeleteScope(ctx.user, input.ids, input.tenantSlug);
        const result = await deleteDocuments(authorizedSlug, input.ids);
        return { success: true, deleted: result.deleted };
      }),
  }),

  coaching: router({
    list: protectedProcedure
      .input(z.object({ year: z.number().optional(), quarter: z.number().optional(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getCoachingItems(slug, input.year, input.quarter);
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getCoachingNote(slug, input.year, input.quarter);
      }),
    saveNote: protectedProcedure
      .input(z.object({ year: z.number(), quarter: z.number(), content: z.string(), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "coaching", input.tenantSlug);
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        await upsertCoachingNote(slug, input.year, input.quarter, input.content);
        return { success: true };
      }),
  }),

  kpi: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "kpi_dashboard", input.tenantSlug);
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
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
        await assertTierAccess(ctx.user, "sales_tracker", input.tenantSlug);
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getSalesTracker(slug, input.year, input.month);
      }),
    getByYear: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await assertTierAccess(ctx.user, "sales_tracker", input.tenantSlug);
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getSalesTrackerByYear(slug, input.year);
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
        await assertTierAccess(ctx.user, "clients", input.tenantSlug);
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getClientRoster(slug);
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        await deleteClientRosterEntry(slug, input.id);
        return { success: true };
      }),
  }),

  aiSummary: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
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
    // List recent messages for the tenant's room (top-level only)
    list: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
        beforeId: z.number().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        return getChatMessages(slug, input.limit, input.beforeId, input.search);
      }),

    // Fetch all replies for a thread (parent message)
    getThread: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        parentId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getThreadReplies(slug, input.parentId);
      }),

    // Send a text message (Phase 1 global chat table)
    send: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        body: z.string().min(1).max(4000),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

        try {
          const msg = await insertGlobalChatTextMessage({
            tenant_slug: slug,
            organization_id: tenant?.id != null ? String(tenant.id) : null,
            sender_user_id: ctx.user.id != null ? String(ctx.user.id) : null,
            sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
            sender_role: ctx.user.role === "admin" ? "admin" : "client",
            message_text: input.body,
          });
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
        parentId: z.number(),
        body: z.string().min(1).max(4000),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        const now = new Date();
        const reply = await insertChatMessageSupabase(slug, {
          sender_user_id: ctx.user.id ?? null,
          sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
          sender_role: ctx.user.role === "admin" ? "admin" : "client",
          message: input.body,
          read: false,
          file_key: null,
          file_url: null,
          file_name: null,
          file_size: null,
          mime_type: null,
          archive_year: now.getFullYear(),
          archive_month: now.getMonth() + 1,
          portal_document_id: null,
          thread_id: input.parentId,
          reply_count: 0,
        });
        // Increment reply count on parent (non-blocking)
        await incrementReplyCount(slug, input.parentId).catch(() => {});
        return reply;
      }),

    // Upload a file attachment — saves to S3, archives to documents table, and records in chat
    sendFile: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        body: z.string().optional(), // optional caption
        fileBase64: z.string(), // base64-encoded file content
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

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
          organization_id: tenant?.id != null ? String(tenant.id) : null,
          sender_user_id: ctx.user.id != null ? String(ctx.user.id) : null,
          sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
          sender_role: ctx.user.role === "admin" ? "admin" : "client",
          message_text: input.body ?? null,
          file_url: fileUrl,
          file_key: fileKey,
          file_name: input.fileName,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          document_metadata_id: insertedDocMetadataId,
          message_type: "file" as const,
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

        return msg;
      }),

    // Delete a message (admin or own message only)
    delete: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        await deleteChatMessageSupabase(slug, input.id);
        return { success: true };
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
      .mutation(async ({ input }) =>
        createStaffMember({ email: input.email, name: input.name, role: input.role as StaffRole })
      ),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        role: z.enum(["admin", "accounting_manager", "tax_manager", "accountant"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        return updateStaffMember(id, updates as Partial<{ name: string; role: StaffRole }>);
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await removeStaffMember(input.id);
        return { success: true };
      }),

    getAssignments: adminProcedure
      .input(z.object({ staffId: z.number() }))
      .query(async ({ input }) => getStaffAssignments(input.staffId)),

    assignClient: adminProcedure
      .input(z.object({ staffId: z.number(), tenantSlug: z.string() }))
      .mutation(async ({ input }) => {
        await assignStaffToClient(input.staffId, input.tenantSlug);
        return { success: true };
      }),

    unassignClient: adminProcedure
      .input(z.object({ staffId: z.number(), tenantSlug: z.string() }))
      .mutation(async ({ input }) => {
        await unassignStaffFromClient(input.staffId, input.tenantSlug);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
