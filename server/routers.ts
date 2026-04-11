import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  deleteCoachingItem,
  deleteDocument,
  getAllTenants,
  getAiSummary,
  getCoachingItems,
  getDocuments,
  getFinancials,
  getKpiMetrics,
  getLineItems,
  getSalesTracker,
  getTenantById,
  getTenantByUserId,
  getTimeLogs,
  insertCoachingItem,
  insertDocument,
  insertLineItem,
  insertTimeLog,
  toggleCoachingItem,
  updateTenantGhlNotes,
  upsertAiSummary,
  upsertFinancial,
  upsertKpiMetric,
  upsertSalesTracker,
  upsertTenant,
} from "./db";

// ─── Admin guard middleware ───────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Tenant context helper ────────────────────────────────────────────────────
// Resolves the effective tenant: either the logged-in client's own tenant,
// or (for admins) an impersonated tenant via tenantId override.
async function resolveTenant(userId: number, role: string, impersonateTenantId?: number) {
  if (role === "admin" && impersonateTenantId) {
    const t = await getTenantById(impersonateTenantId);
    if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
    return t;
  }
  const t = await getTenantByUserId(userId);
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "No tenant profile found for this user" });
  return t;
}

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ─────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Tenant ───────────────────────────────────────────────────────────────
  tenant: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      return getTenantByUserId(ctx.user.id);
    }),
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getTenantById(input.id);
      }),
    list: adminProcedure.query(async () => {
      return getAllTenants();
    }),
    upsert: adminProcedure
      .input(
        z.object({
          id: z.number().optional(),
          userId: z.number(),
          companyName: z.string().optional(),
          contactName: z.string().optional(),
          email: z.string().optional(),
          packageTier: z.enum(["legacy", "momentum", "growth_1", "growth_2", "cfo"]),
          isActive: z.boolean().optional(),
          ghlNotes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertTenant(input as any);
        return { success: true };
      }),
    updateGhlNotes: adminProcedure
      .input(z.object({ tenantId: z.number(), notes: z.string() }))
      .mutation(async ({ input }) => {
        await updateTenantGhlNotes(input.tenantId, input.notes);
        return { success: true };
      }),
  }),

  // ─── Financials ───────────────────────────────────────────────────────────
  financials: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number().optional(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getFinancials(tenant.id, input.year, input.month);
      }),
    lineItems: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getLineItems(tenant.id, input.year, input.month);
      }),
    upsert: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          year: z.number(),
          month: z.number(),
          revenue: z.string().optional(),
          expenses: z.string().optional(),
          netProfit: z.string().optional(),
          margin: z.string().optional(),
          budgetRevenue: z.string().optional(),
          budgetExpenses: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertFinancial(input as any);
        return { success: true };
      }),
    addLineItem: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          year: z.number(),
          month: z.number(),
          type: z.enum(["income", "expense"]),
          label: z.string(),
          amount: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await insertLineItem(input as any);
        return { success: true };
      }),
  }),

  // ─── Documents ────────────────────────────────────────────────────────────
  documents: router({
    list: protectedProcedure
      .input(z.object({ year: z.number().optional(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getDocuments(tenant.id, input.year);
      }),
    upload: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          name: z.string(),
          year: z.number(),
          fileBase64: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const fileKey = `tenants/${input.tenantId}/docs/${input.year}/${Date.now()}-${input.name}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await insertDocument({
          tenantId: input.tenantId,
          name: input.name,
          fileKey,
          fileUrl: url,
          mimeType: input.mimeType,
          year: input.year,
          uploadedBy: ctx.user.id,
        });
        return { success: true, url };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteDocument(input.id);
        return { success: true };
      }),
  }),

  // ─── Coaching ─────────────────────────────────────────────────────────────
  coaching: router({
    list: protectedProcedure
      .input(z.object({ quarter: z.string().optional(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getCoachingItems(tenant.id, input.quarter);
      }),
    add: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          quarter: z.string(),
          title: z.string(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await insertCoachingItem(input);
        return { success: true };
      }),
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), isCompleted: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleCoachingItem(input.id, input.isCompleted);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCoachingItem(input.id);
        return { success: true };
      }),
  }),

  // ─── KPI Metrics ──────────────────────────────────────────────────────────
  kpi: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getKpiMetrics(tenant.id, input.year);
      }),
    upsert: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          year: z.number(),
          month: z.number(),
          cac: z.string().optional(),
          churnRate: z.string().optional(),
          ltv: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertKpiMetric(input as any);
        return { success: true };
      }),
  }),

  // ─── Time Intelligence ────────────────────────────────────────────────────
  time: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getTimeLogs(tenant.id, input.year, input.month);
      }),
    add: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          year: z.number(),
          month: z.number(),
          focusArea: z.string(),
          hours: z.string(),
          delegationSuggestion: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await insertTimeLog(input as any);
        return { success: true };
      }),
  }),

  // ─── Sales Tracker ────────────────────────────────────────────────────────
  sales: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getSalesTracker(tenant.id, input.year, input.month);
      }),
    upsert: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          year: z.number(),
          month: z.number(),
          goalClients: z.number(),
          signedClients: z.number(),
          referralCount: z.number(),
          outboundCount: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await upsertSalesTracker(input);
        return { success: true };
      }),
  }),

  // ─── AI Summaries ─────────────────────────────────────────────────────────
  aiSummary: router({
    get: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number(), tenantId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const tenant = await resolveTenant(ctx.user.id, ctx.user.role, input.tenantId);
        return getAiSummary(tenant.id, input.year, input.month);
      }),
    generate: adminProcedure
      .input(
        z.object({
          tenantId: z.number(),
          year: z.number(),
          month: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const financialData = await getFinancials(input.tenantId, input.year, input.month);
        const lineItemData = await getLineItems(input.tenantId, input.year, input.month);

        const prompt = `You are a financial advisor for KynLi Consulting. Generate a concise, professional monthly financial summary for a client based on the following data:

Month: ${input.month}/${input.year}
${financialData.length > 0 ? `Revenue: $${financialData[0].revenue}, Expenses: $${financialData[0].expenses}, Net Profit: $${financialData[0].netProfit}, Margin: ${financialData[0].margin}%` : "No financial data available."}

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
        await upsertAiSummary({ tenantId: input.tenantId, year: input.year, month: input.month, content });
        return { success: true, content };
      }),
  }),
});

export type AppRouter = typeof appRouter;
