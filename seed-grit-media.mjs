/**
 * Seed script: Grit Media Group LLC — Jan/Feb/Mar 2026
 * Run: node seed-grit-media.mjs
 *
 * Creates:
 *  - 1 user (admin-linked placeholder for the client)
 *  - 1 tenant (Growth 1 tier)
 *  - 3 months of financials (Jan/Feb/Mar 2026)
 *  - Top income + expense line items per month
 *  - 3 coaching items for Q1 2026
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DB_URL);

// ── Helper ────────────────────────────────────────────────────────────────────
async function query(sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}

// ── 1. Create a placeholder user for Grit Media Group ────────────────────────
// We use a synthetic openId since this is a test seed (not a real OAuth user yet)
const OPEN_ID = "seed-grit-media-group-llc";
const COMPANY = "Grit Media Group LLC";

await query(`
  INSERT INTO users (openId, name, email, loginMethod, role, lastSignedIn, createdAt, updatedAt)
  VALUES (?, ?, ?, 'email', 'user', NOW(), NOW(), NOW())
  ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)
`, [OPEN_ID, "Grit Media Group", "client@gritmediagroup.com"]);

const [userRow] = await query(`SELECT id FROM users WHERE openId = ?`, [OPEN_ID]);
const userId = userRow.id;
console.log(`✓ User created/found: id=${userId}`);

// ── 2. Create the tenant ──────────────────────────────────────────────────────
await query(`
  INSERT INTO tenants (userId, companyName, contactName, email, packageTier, isActive, ghlNotes, createdAt, updatedAt, signedAt)
  VALUES (?, ?, ?, ?, 'growth_1', 1, ?, NOW(), NOW(), NOW())
  ON DUPLICATE KEY UPDATE companyName = VALUES(companyName), packageTier = VALUES(packageTier)
`, [
  userId,
  COMPANY,
  "Cameron (Owner)",
  "client@gritmediagroup.com",
  "Growth 1 client — 3 months of financial data seeded for testing."
]);

const [tenantRow] = await query(`SELECT id FROM tenants WHERE userId = ?`, [userId]);
const tenantId = tenantRow.id;
console.log(`✓ Tenant created/found: id=${tenantId}`);

// ── 3. Financials ─────────────────────────────────────────────────────────────
// Source: PDFs — Jan/Feb/Mar 2026 actuals
const financialsData = [
  {
    month: 1, year: 2026,
    revenue: 106624.00,
    budgetRevenue: 117368.00,
    expenses: 83956.00,
    budgetExpenses: 87919.00,
    netProfit: 15267.00,
    margin: 14.31,
  },
  {
    month: 2, year: 2026,
    revenue: 104898.00,
    budgetRevenue: 121104.00,
    expenses: 95564.00,
    budgetExpenses: 87687.00,
    netProfit: 2126.00,
    margin: 2.03,
  },
  {
    month: 3, year: 2026,
    revenue: 108436.00,
    budgetRevenue: 124652.00,
    expenses: 112417.00,
    budgetExpenses: 88334.00,
    netProfit: -6162.00,
    margin: -5.68,
  },
];

for (const f of financialsData) {
  await query(`
    INSERT INTO financials (tenantId, year, month, revenue, expenses, netProfit, margin, budgetRevenue, budgetExpenses, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE revenue=VALUES(revenue), expenses=VALUES(expenses), netProfit=VALUES(netProfit),
      margin=VALUES(margin), budgetRevenue=VALUES(budgetRevenue), budgetExpenses=VALUES(budgetExpenses)
  `, [tenantId, f.year, f.month, f.revenue, f.expenses, f.netProfit, f.margin, f.budgetRevenue, f.budgetExpenses]);
  console.log(`  ✓ Financials ${f.year}-${String(f.month).padStart(2,"0")} inserted`);
}

// ── 4. Line Items ─────────────────────────────────────────────────────────────
// Top income sources + top expense categories per month (from P&L actuals)
const lineItemsData = [
  // January 2026
  { month: 1, year: 2026, type: "income",  label: "Monthly SEO Services",       amount: 76569.00 },
  { month: 1, year: 2026, type: "income",  label: "Ad Management",               amount: 16150.00 },
  { month: 1, year: 2026, type: "income",  label: "Website Design",              amount: 9498.00 },
  { month: 1, year: 2026, type: "income",  label: "Software Income",             amount: 6166.00 },
  { month: 1, year: 2026, type: "income",  label: "Monthly Website Maintenance", amount: 1600.00 },
  { month: 1, year: 2026, type: "expense", label: "Contractors",                 amount: 38969.00 },
  { month: 1, year: 2026, type: "expense", label: "Payroll (Salary + Owner)",    amount: 22516.00 },
  { month: 1, year: 2026, type: "expense", label: "Software & Tech Fees",        amount: 8627.00 },
  { month: 1, year: 2026, type: "expense", label: "Cost of Services - Tech",     amount: 7401.00 },
  { month: 1, year: 2026, type: "expense", label: "Legal & Professional Svcs",   amount: 4000.00 },

  // February 2026
  { month: 2, year: 2026, type: "income",  label: "Monthly SEO Services",       amount: 66199.00 },
  { month: 2, year: 2026, type: "income",  label: "Ad Management",               amount: 16600.00 },
  { month: 2, year: 2026, type: "income",  label: "Website Design",              amount: 11698.00 },
  { month: 2, year: 2026, type: "income",  label: "Monthly Website Maintenance", amount: 4240.00 },
  { month: 2, year: 2026, type: "income",  label: "Software Income",             amount: 5639.00 },
  { month: 2, year: 2026, type: "expense", label: "Contractors",                 amount: 40948.00 },
  { month: 2, year: 2026, type: "expense", label: "Payroll (Salary + Owner)",    amount: 22245.00 },
  { month: 2, year: 2026, type: "expense", label: "Software & Tech Fees",        amount: 10632.00 },
  { month: 2, year: 2026, type: "expense", label: "Taxes Paid",                  amount: 6229.00 },
  { month: 2, year: 2026, type: "expense", label: "Legal & Professional Svcs",   amount: 4000.00 },

  // March 2026
  { month: 3, year: 2026, type: "income",  label: "Monthly SEO Services",       amount: 67649.00 },
  { month: 3, year: 2026, type: "income",  label: "Ad Management",               amount: 12933.00 },
  { month: 3, year: 2026, type: "income",  label: "Website Design",              amount: 10698.00 },
  { month: 3, year: 2026, type: "income",  label: "Monthly Website Maintenance", amount: 2050.00 },
  { month: 3, year: 2026, type: "income",  label: "Software Income",             amount: 4074.00 },
  { month: 3, year: 2026, type: "expense", label: "Contractors",                 amount: 44650.00 },
  { month: 3, year: 2026, type: "expense", label: "Legal & Professional Svcs",   amount: 24247.00 }, // includes $22.7k coaching
  { month: 3, year: 2026, type: "expense", label: "Payroll (Salary + Owner)",    amount: 22078.00 },
  { month: 3, year: 2026, type: "expense", label: "Software & Tech Fees",        amount: 9349.00 },
  { month: 3, year: 2026, type: "expense", label: "Cost of Services - Tech",     amount: 2181.00 },
];

// Delete existing line items for this tenant first to avoid duplicates
await query(`DELETE FROM line_items WHERE tenantId = ?`, [tenantId]);
for (const li of lineItemsData) {
  await query(`
    INSERT INTO line_items (tenantId, year, month, type, label, amount, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `, [tenantId, li.year, li.month, li.type, li.label, li.amount]);
}
console.log(`✓ ${lineItemsData.length} line items inserted`);

// ── 5. Coaching Items (Q1 2026) ───────────────────────────────────────────────
const coachingData = [
  {
    quarter: "2026-Q1",
    title: "Review Q1 P&L and identify top 3 cost reduction opportunities",
    notes: "Focus on contractor spend — $44k in March is above budget. Identify which contractors can be reduced or renegotiated.",
    isCompleted: false,
  },
  {
    quarter: "2026-Q1",
    title: "Stabilize SEO revenue — address $10k MoM drop from Jan to Feb",
    notes: "SEO revenue dropped from $76.5k (Jan) to $66.2k (Feb). Investigate client churn or scope reduction.",
    isCompleted: false,
  },
  {
    quarter: "2026-Q1",
    title: "Build a 90-day cash flow projection through Q2 2026",
    notes: "March ended at -$6.2k net profit. Need forward visibility before Q2 budget commitments.",
    isCompleted: false,
  },
];

for (const c of coachingData) {
  await query(`
    INSERT INTO coaching_items (tenantId, quarter, title, notes, isCompleted, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  `, [tenantId, c.quarter, c.title, c.notes, c.isCompleted ? 1 : 0]);
}
console.log(`✓ ${coachingData.length} coaching items inserted`);

await conn.end();
console.log("\n✅ Seed complete — Grit Media Group LLC is ready in the portal.");
console.log(`   Tenant ID: ${tenantId} | User ID: ${userId} | Tier: growth_1`);
