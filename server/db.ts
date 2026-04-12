import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  aiSummaries,
  clientRoster,
  coachingItems,
  documents,
  financials,
  kpiMetrics,
  lineItems,
  salesTracker,
  tenants,
  timeLogs,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Tenants ─────────────────────────────────────────────────────────────────
export async function getTenantByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tenants).where(eq(tenants.userId, userId)).limit(1);
  return result[0];
}

export async function getAllTenants() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tenants).orderBy(desc(tenants.createdAt));
}

export async function getTenantById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return result[0];
}

export async function upsertTenant(data: typeof tenants.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(tenants).values(data).onDuplicateKeyUpdate({ set: data });
}

export async function updateTenantGhlNotes(tenantId: number, notes: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(tenants).set({ ghlNotes: notes }).where(eq(tenants.id, tenantId));
}

// ─── Financials ──────────────────────────────────────────────────────────────
export async function getFinancials(tenantId: number, year: number, month?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(financials.tenantId, tenantId), eq(financials.year, year)];
  if (month !== undefined) conditions.push(eq(financials.month, month));
  return db.select().from(financials).where(and(...conditions)).orderBy(financials.month);
}

export async function upsertFinancial(data: typeof financials.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(financials).values(data).onDuplicateKeyUpdate({ set: data });
}

export async function getLineItems(tenantId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(lineItems)
    .where(
      and(
        eq(lineItems.tenantId, tenantId),
        eq(lineItems.year, year),
        eq(lineItems.month, month)
      )
    )
    .orderBy(desc(lineItems.amount));
}

export async function getLineItemsByYear(tenantId: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(lineItems)
    .where(
      and(
        eq(lineItems.tenantId, tenantId),
        eq(lineItems.year, year)
      )
    )
    .orderBy(desc(lineItems.amount));
}

export async function insertLineItem(data: typeof lineItems.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(lineItems).values(data);
}

// ─── Documents ───────────────────────────────────────────────────────────────
export async function getDocuments(tenantId: number, year?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(documents.tenantId, tenantId)];
  if (year !== undefined) conditions.push(eq(documents.year, year));
  return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
}

export async function insertDocument(data: typeof documents.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(documents).values(data);
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(documents).where(eq(documents.id, id));
}

// ─── Coaching Items ───────────────────────────────────────────────────────────
export async function getCoachingItems(tenantId: number, quarter?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(coachingItems.tenantId, tenantId)];
  if (quarter) conditions.push(eq(coachingItems.quarter, quarter));
  return db.select().from(coachingItems).where(and(...conditions)).orderBy(coachingItems.createdAt);
}

export async function insertCoachingItem(data: typeof coachingItems.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(coachingItems).values(data);
}

export async function toggleCoachingItem(id: number, isCompleted: boolean) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(coachingItems)
    .set({ isCompleted, completedAt: isCompleted ? new Date() : null })
    .where(eq(coachingItems.id, id));
}

export async function deleteCoachingItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(coachingItems).where(eq(coachingItems.id, id));
}

// ─── KPI Metrics ─────────────────────────────────────────────────────────────
export async function getKpiMetrics(tenantId: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(kpiMetrics)
    .where(and(eq(kpiMetrics.tenantId, tenantId), eq(kpiMetrics.year, year)))
    .orderBy(kpiMetrics.month);
}

export async function upsertKpiMetric(data: typeof kpiMetrics.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(kpiMetrics).values(data).onDuplicateKeyUpdate({ set: data });
}

// ─── Time Logs ───────────────────────────────────────────────────────────────
export async function getTimeLogs(tenantId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.tenantId, tenantId), eq(timeLogs.year, year), eq(timeLogs.month, month)));
}

export async function insertTimeLog(data: typeof timeLogs.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(timeLogs).values(data);
}

// ─── Sales Tracker ───────────────────────────────────────────────────────────
export async function getSalesTracker(tenantId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(salesTracker)
    .where(
      and(eq(salesTracker.tenantId, tenantId), eq(salesTracker.year, year), eq(salesTracker.month, month))
    )
    .limit(1);
  return result[0];
}

export async function upsertSalesTracker(data: typeof salesTracker.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(salesTracker).values(data).onDuplicateKeyUpdate({ set: data });
}

// ─── AI Summaries ─────────────────────────────────────────────────────────────
export async function getAiSummary(tenantId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(aiSummaries)
    .where(
      and(eq(aiSummaries.tenantId, tenantId), eq(aiSummaries.year, year), eq(aiSummaries.month, month))
    )
    .limit(1);
  return result[0];
}

export async function upsertAiSummary(data: typeof aiSummaries.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(aiSummaries).values(data).onDuplicateKeyUpdate({ set: data });
}

// ─── Client Roster ────────────────────────────────────────────────────────────
export async function getClientRoster(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(clientRoster)
    .where(eq(clientRoster.tenantId, tenantId))
    .orderBy(clientRoster.clientName);
}

export async function insertClientRosterEntry(data: typeof clientRoster.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clientRoster).values(data);
}
