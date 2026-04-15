import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
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
      .input(z.object({ year: z.number().optional(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getDocuments(slug, input.year);
      }),
    upload: protectedProcedure
      .input(z.object({
        tenantSlug: z.string().optional(),
        name: z.string(), fileBase64: z.string(), mimeType: z.string(),
        docType: z.string().optional(), description: z.string().optional(), year: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.mimeType.split("/")[1] || "bin";
        const fileKey = `${slug}/docs/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await insertDocument(slug, {
          name: input.name, file_url: url, file_key: fileKey,
          doc_type: input.docType || "general",
          description: input.description || null,
          year: input.year || null, mime_type: input.mimeType,
        });
        return { success: true, url };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number(), tenantSlug: z.string() }))
      .mutation(async ({ input }) => {
        await deleteDocument(input.tenantSlug, input.id);
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
      .input(z.object({ year: z.number(), month: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getTimeLogs(slug, input.year, input.month);
      }),
    getByYear: protectedProcedure
      .input(z.object({ year: z.number(), tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getTimeLogsByYear(slug, input.year);
      }),
    add: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
        year: z.number(), month: z.number(),
        logDate: z.string().nullable().optional(),
        teamMember: z.string().nullable().optional(),
        taskCategory: z.string().nullable().optional(),
        focusArea: z.string(),
        hours: z.number(),
        minutes: z.number().nullable().optional(),
        delegationNote: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await insertTimeLog(input.tenantSlug, {
          year: input.year, month: input.month,
          log_date: input.logDate || null,
          team_member: input.teamMember || null,
          task_category: input.taskCategory || null,
          focus_area: input.focusArea,
          hours: input.hours,
          minutes: input.minutes ?? null,
          delegation_note: input.delegationNote || null,
        });
        return { success: true };
      }),
    addBulk: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
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
      .mutation(async ({ input }) => {
        for (const e of input.entries) {
          await insertTimeLog(input.tenantSlug, {
            year: e.year, month: e.month,
            log_date: e.logDate || null,
            team_member: e.teamMember || null,
            task_category: e.taskCategory || null,
            focus_area: e.focusArea,
            hours: e.hours,
            minutes: e.minutes ?? null,
            delegation_note: e.delegationNote || null,
          });
        }
        return { success: true, count: input.entries.length };
      }),
    deleteEntry: adminProcedure
      .input(z.object({ tenantSlug: z.string(), id: z.number() }))
      .mutation(async ({ input }) => {
        const { error } = await supabase.from(`${input.tenantSlug}_time_logs`).delete().eq("id", input.id);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return { success: true };
      }),
    getTeamMembers: protectedProcedure
      .input(z.object({ tenantSlug: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const slug = await resolveTenantSlug(ctx.user, input.tenantSlug);
        return getTeamMembers(slug);
      }),
    addTeamMember: adminProcedure
      .input(z.object({ tenantSlug: z.string(), name: z.string() }))
      .mutation(async ({ input }) => {
        await addTeamMember(input.tenantSlug, input.name);
        return { success: true };
      }),
    deleteTeamMember: adminProcedure
      .input(z.object({ tenantSlug: z.string(), id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTeamMember(input.tenantSlug, input.id);
        return { success: true };
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
    add: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
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
      .mutation(async ({ input }) => {
        await upsertClientRosterEntry(input.tenantSlug, {
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
    update: adminProcedure
      .input(z.object({
        tenantSlug: z.string(),
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
      .mutation(async ({ input }) => {
        const { tenantSlug, id, clientName, monthlyAmount, signedDate, tenureMonths, totalIncome, notes, package: pkg, status } = input;
        // Use upsert with id to update existing record
        await supabase
          .from(`${tenantSlug}_client_roster`)
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
    delete: adminProcedure
      .input(z.object({ tenantSlug: z.string(), id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteClientRosterEntry(input.tenantSlug, input.id);
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
});

export type AppRouter = typeof appRouter;
