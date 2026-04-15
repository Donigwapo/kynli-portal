import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Tenants (Client Accounts) ───────────────────────────────────────────────
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // FK → users.id — one tenant per user
  companyName: varchar("companyName", { length: 255 }),
  contactName: varchar("contactName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  packageTier: mysqlEnum("packageTier", [
    "legacy",
    "momentum",
    "growth_1",
    "growth_2",
    "cfo",
  ])
    .default("legacy")
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  signedAt: timestamp("signedAt").defaultNow().notNull(),
  ghlNotes: text("ghlNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ─── Financials ──────────────────────────────────────────────────────────────
export const financials = mysqlTable("financials", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(), // 1–12
  revenue: decimal("revenue", { precision: 15, scale: 2 }).default("0"),
  expenses: decimal("expenses", { precision: 15, scale: 2 }).default("0"),
  netProfit: decimal("netProfit", { precision: 15, scale: 2 }).default("0"),
  margin: decimal("margin", { precision: 6, scale: 2 }).default("0"), // percentage
  budgetRevenue: decimal("budgetRevenue", { precision: 15, scale: 2 }).default("0"),
  budgetExpenses: decimal("budgetExpenses", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqTenantYearMonth: uniqueIndex("financials_tenant_year_month").on(t.tenantId, t.year, t.month),
}));

export type Financial = typeof financials.$inferSelect;
export type InsertFinancial = typeof financials.$inferInsert;

// ─── Income / Expense Line Items ─────────────────────────────────────────────
export const lineItems = mysqlTable("line_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LineItem = typeof lineItems.$inferSelect;
export type InsertLineItem = typeof lineItems.$inferInsert;

// ─── Documents (Vault) ───────────────────────────────────────────────────────
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  year: int("year").notNull(),
  uploadedBy: int("uploadedBy"), // FK → users.id (admin who uploaded)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Coaching / Accountability Items ─────────────────────────────────────────
export const coachingItems = mysqlTable("coaching_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  quarter: varchar("quarter", { length: 10 }).notNull(), // e.g. "2026-Q1"
  title: varchar("title", { length: 512 }).notNull(),
  notes: text("notes"),
  isCompleted: boolean("isCompleted").default(false).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CoachingItem = typeof coachingItems.$inferSelect;
export type InsertCoachingItem = typeof coachingItems.$inferInsert;

// ─── KPI Metrics ─────────────────────────────────────────────────────────────
export const kpiMetrics = mysqlTable("kpi_metrics", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  cac: decimal("cac", { precision: 15, scale: 2 }), // Customer Acquisition Cost
  churnRate: decimal("churnRate", { precision: 6, scale: 2 }), // percentage
  ltv: decimal("ltv", { precision: 15, scale: 2 }), // Lifetime Value
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqTenantYearMonth: uniqueIndex("kpi_tenant_year_month").on(t.tenantId, t.year, t.month),
}));

export type KpiMetric = typeof kpiMetrics.$inferSelect;
export type InsertKpiMetric = typeof kpiMetrics.$inferInsert;

// ─── Team Members ────────────────────────────────────────────────────────────
export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

// ─── Focus Areas ─────────────────────────────────────────────────────────────
export const focusAreas = mysqlTable("focus_areas", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FocusArea = typeof focusAreas.$inferSelect;
export type InsertFocusArea = typeof focusAreas.$inferInsert;

// ─── Time Logs (Time Intelligence) ───────────────────────────────────────────
export const timeLogs = mysqlTable("time_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  logDate: varchar("logDate", { length: 10 }), // YYYY-MM-DD
  teamMember: varchar("teamMember", { length: 255 }),
  focusArea: varchar("focusArea", { length: 128 }).notNull(),
  taskCategory: varchar("taskCategory", { length: 255 }),
  hours: decimal("hours", { precision: 8, scale: 2 }).notNull(),
  minutes: int("minutes").default(0),
  delegationSuggestion: text("delegationSuggestion"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TimeLog = typeof timeLogs.$inferSelect;
export type InsertTimeLog = typeof timeLogs.$inferInsert;

// ─── Sales Tracker ───────────────────────────────────────────────────────────
export const salesTracker = mysqlTable("sales_tracker", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  goalClients: int("goalClients").default(0).notNull(),
  signedClients: int("signedClients").default(0).notNull(),
  referralCount: int("referralCount").default(0).notNull(),
  outboundCount: int("outboundCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniqTenantYearMonth: uniqueIndex("sales_tenant_year_month").on(t.tenantId, t.year, t.month),
}));

export type SalesTracker = typeof salesTracker.$inferSelect;
export type InsertSalesTracker = typeof salesTracker.$inferInsert;

// ─── AI Summaries ────────────────────────────────────────────────────────────
export const aiSummaries = mysqlTable("ai_summaries", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  content: text("content").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
}, (t) => ({
  uniqTenantYearMonth: uniqueIndex("ai_summary_tenant_year_month").on(t.tenantId, t.year, t.month),
}));

export type AiSummary = typeof aiSummaries.$inferSelect;
export type InsertAiSummary = typeof aiSummaries.$inferInsert;
