import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
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
  getDocuments as getDocumentsDb,
  insertDocument as insertDocumentDb,
  deleteDocument as deleteDocumentDb,
} from "./db";
import {
  getAllPortalTenants,
  getClientRoster,
  getCoachingItems,
  getDocuments,
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
  insertDocument,
  insertLineItem,
  insertTimeLog,
  supabase,
  toggleCoachingItem,
  deleteCoachingItem,
  deleteDocument,
  upsertFinancial,
  updateFinancialSummary,
  upsertKpiMetric,
  upsertPortalTenant,
  upsertSalesTracker,
  getCoachingNote,
  upsertCoachingNote,
  getLineItemsByYear,
  getChatMessages,
  insertChatMessageSupabase,
  deleteChatMessageSupabase,
  type PortalUser,
} from "./supabase";

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
        return { success: true };
      }),
    updateGhlNotes: adminProcedure
      .input(z.object({ slug: z.string(), notes: z.string() }))
      .mutation(async ({ input }) => {
        await updateTenantGhlNotes(input.slug, input.notes);
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
      }))
      .query(async ({ ctx, input }) => {
        return getDocumentsDb(ctx.user.id, input.year, input.docType, input.month);
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
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.mimeType.split("/")[1]
          ?.replace("vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx")
          .replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx") || "bin";
        const tenantSlug = ctx.user.tenant_slug || `tenant-${ctx.user.id}`;
        const safeDocType = input.docType.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const timestamp = Date.now();
        const rand = Math.random().toString(36).slice(2);
        const originalFileName = input.fileName || `document-${timestamp}.${ext}`;
        // Upload to Supabase Storage: documents/{tenantSlug}/{docType}/{timestamp}-{rand}-{filename}
        const supabasePath = `${tenantSlug}/${safeDocType}/${timestamp}-${rand}-${originalFileName}`;
        const { error: sbError } = await supabase.storage
          .from("documents")
          .upload(supabasePath, buffer, { contentType: input.mimeType, upsert: false });
        let fileUrl: string;
        let fileKey: string;
        if (sbError) {
          // Fallback to S3 if Supabase upload fails
          console.warn("Supabase upload failed, falling back to S3:", sbError.message);
          const s3Key = `docs/${tenantSlug}/${safeDocType}/${timestamp}-${rand}.${ext}`;
          const s3Result = await storagePut(s3Key, buffer, input.mimeType);
          fileUrl = s3Result.url;
          fileKey = s3Key;
        } else {
          const { data: urlData } = supabase.storage.from("documents").getPublicUrl(supabasePath);
          fileUrl = urlData.publicUrl;
          fileKey = supabasePath;
        }
        await insertDocumentDb({
          tenantId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          docType: input.docType,
          fileKey,
          fileUrl,
          fileName: input.fileName || null,
          fileSize: input.fileSize || null,
          mimeType: input.mimeType,
          year: input.year,
          month: input.month ?? null,
        });
        return { success: true, url: fileUrl };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteDocumentDb(input.id);
        return { success: true };
      }),
  }),

  coaching: router({
    list: protectedProcedure
      .input(z.object({ year: z.number().optional(), quarter: z.number().optional(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getCoachingNote(slug, input.year, input.quarter);
      }),
    saveNote: protectedProcedure
      .input(z.object({ year: z.number(), quarter: z.number(), content: z.string(), tenantSlug: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        await upsertCoachingNote(slug, input.year, input.quarter, input.content);
        return { success: true };
      }),
  }),

  kpi: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
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
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getSalesTracker(slug, input.year, input.month);
      }),
    getByYear: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
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
    // List recent messages for the tenant's room
    list: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
        beforeId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        return getChatMessages(slug, input.limit, input.beforeId);
      }),

    // Send a text message
    send: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        body: z.string().min(1).max(4000),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
        const now = new Date();
        const msg = await insertChatMessageSupabase(slug, {
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
        });
        return msg;
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

        // Upload file bytes to S3
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `${slug}/chat/${archiveYear}-${String(archiveMonth).padStart(2, "0")}/${suffix}-${input.fileName}`;
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.mimeType);

        // Auto-archive to portal documents table
        const docData = {
          tenantId: tenant.id,
          name: input.fileName,
          description: `Shared via chat by ${ctx.user.name ?? ctx.user.email ?? "Unknown"}`,
          docType: "Chat Attachment",
          fileKey,
          fileUrl,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          year: archiveYear,
          month: archiveMonth,
          uploadedBy: ctx.user.id ?? null,
        };
        const insertedDoc = await insertDocumentDb(docData);

        // Record in chat (Supabase)
        const msg = await insertChatMessageSupabase(slug, {
          sender_user_id: ctx.user.id ?? null,
          sender_name: ctx.user.name ?? ctx.user.email ?? "Unknown",
          sender_role: ctx.user.role === "admin" ? "admin" : "client",
          message: input.body ?? null,
          read: false,
          file_key: fileKey,
          file_url: fileUrl,
          file_name: input.fileName,
          file_size: input.fileSize,
          mime_type: input.mimeType,
          archive_year: archiveYear,
          archive_month: archiveMonth,
          portal_document_id: insertedDoc?.id ?? null,
        });

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
});
export type AppRouter = typeof appRouter;
