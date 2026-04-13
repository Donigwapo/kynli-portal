/**
 * migrate-pg.mjs
 * Direct Postgres migration for KynLi Portal → Supabase
 * Run: node scripts/migrate-pg.mjs
 */

import pg from "pg";
const { Client } = pg;

const DB_URL = "postgresql://postgres:O5NRw7GvjMueyx92@db.kibgbraksgztfmtwlabb.supabase.co:5432/postgres";

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function run(sql, label) {
  try {
    await client.query(sql);
    console.log(`  ✅ ${label}`);
    return true;
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log(`  ℹ️  ${label} — already exists`);
      return true;
    }
    console.error(`  ❌ ${label}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 KynLi Portal — Supabase Direct Postgres Migration");
  console.log("======================================================");

  await client.connect();
  console.log("✅ Connected to Supabase Postgres\n");

  // ─── STEP 1: Global tables ──────────────────────────────────────────────────
  console.log("📋 Creating global tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS portal_users (
      id                  BIGSERIAL PRIMARY KEY,
      supabase_uid        UUID UNIQUE,
      email               TEXT UNIQUE NOT NULL,
      name                TEXT,
      role                TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
      tenant_slug         TEXT,
      must_reset_password BOOLEAN DEFAULT TRUE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `, "portal_users");

  await run(`
    CREATE TABLE IF NOT EXISTS portal_tenants (
      id            BIGSERIAL PRIMARY KEY,
      slug          TEXT UNIQUE NOT NULL,
      company_name  TEXT NOT NULL,
      contact_name  TEXT,
      email         TEXT,
      package_tier  TEXT NOT NULL DEFAULT 'cfo' CHECK (package_tier IN ('legacy', 'momentum', 'growth_1', 'growth_2', 'cfo')),
      is_active     BOOLEAN DEFAULT TRUE,
      ghl_notes     TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `, "portal_tenants");

  await run(`
    CREATE TABLE IF NOT EXISTS client_roster (
      id            BIGSERIAL PRIMARY KEY,
      tenant_slug   TEXT NOT NULL,
      client_name   TEXT NOT NULL,
      package_tier  TEXT NOT NULL CHECK (package_tier IN ('legacy', 'momentum', 'growth_1', 'growth_2', 'cfo')),
      monthly_fee   NUMERIC(15,2) DEFAULT 0,
      signed_at     TIMESTAMPTZ NOT NULL,
      status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'churned')),
      total_income  NUMERIC(15,2) DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `, "client_roster");

  // ─── STEP 2: Grit Media Group LLC per-client tables ─────────────────────────
  console.log("\n📋 Creating Grit Media Group LLC tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_financials (
      id                  BIGSERIAL PRIMARY KEY,
      year                INTEGER NOT NULL,
      month               INTEGER NOT NULL,
      revenue             NUMERIC(15,2) DEFAULT 0,
      budget_revenue      NUMERIC(15,2) DEFAULT 0,
      expenses            NUMERIC(15,2) DEFAULT 0,
      budget_expenses     NUMERIC(15,2) DEFAULT 0,
      net_profit          NUMERIC(15,2) DEFAULT 0,
      net_profit_margin   NUMERIC(8,4) DEFAULT 0,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, month)
    )
  `, "grit_media_group_llc_financials");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_line_items (
      id          BIGSERIAL PRIMARY KEY,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      label       TEXT NOT NULL,
      amount      NUMERIC(15,2) DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `, "grit_media_group_llc_line_items");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_documents (
      id          BIGSERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      file_url    TEXT NOT NULL,
      file_key    TEXT NOT NULL,
      doc_type    TEXT DEFAULT 'general',
      description TEXT,
      year        INTEGER,
      mime_type   TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `, "grit_media_group_llc_documents");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_coaching (
      id          BIGSERIAL PRIMARY KEY,
      year        INTEGER NOT NULL,
      quarter     INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
      title       TEXT NOT NULL,
      description TEXT,
      completed   BOOLEAN DEFAULT FALSE,
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `, "grit_media_group_llc_coaching");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_kpi_metrics (
      id          BIGSERIAL PRIMARY KEY,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      cac         NUMERIC(15,2) DEFAULT 0,
      churn_rate  NUMERIC(8,4) DEFAULT 0,
      ltv         NUMERIC(15,2) DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, month)
    )
  `, "grit_media_group_llc_kpi_metrics");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_time_logs (
      id              BIGSERIAL PRIMARY KEY,
      year            INTEGER NOT NULL,
      month           INTEGER NOT NULL,
      focus_area      TEXT NOT NULL,
      hours           NUMERIC(8,2) DEFAULT 0,
      delegation_note TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `, "grit_media_group_llc_time_logs");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_sales_tracker (
      id              BIGSERIAL PRIMARY KEY,
      year            INTEGER NOT NULL,
      month           INTEGER NOT NULL,
      goal_clients    INTEGER DEFAULT 0,
      signed_clients  INTEGER DEFAULT 0,
      referral_count  INTEGER DEFAULT 0,
      outbound_count  INTEGER DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, month)
    )
  `, "grit_media_group_llc_sales_tracker");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_chat (
      id          BIGSERIAL PRIMARY KEY,
      sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'admin')),
      sender_name TEXT NOT NULL,
      message     TEXT NOT NULL,
      read        BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `, "grit_media_group_llc_chat");

  await run(`
    CREATE TABLE IF NOT EXISTS grit_media_group_llc_ai_summaries (
      id            BIGSERIAL PRIMARY KEY,
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      content       TEXT NOT NULL,
      generated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, month)
    )
  `, "grit_media_group_llc_ai_summaries");

  // ─── STEP 3: Seed tenant ────────────────────────────────────────────────────
  console.log("\n📊 Seeding tenant record...");
  await run(`
    INSERT INTO portal_tenants (slug, company_name, contact_name, email, package_tier, is_active)
    VALUES ('grit_media_group_llc', 'Grit Media Group LLC', 'Mecheal', 'mechealleq@gmail.com', 'cfo', true)
    ON CONFLICT (slug) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      contact_name = EXCLUDED.contact_name,
      email        = EXCLUDED.email,
      updated_at   = NOW()
  `, "Tenant: Grit Media Group LLC");

  // ─── STEP 4: Seed financials ────────────────────────────────────────────────
  console.log("\n📊 Seeding financials (Jan–Mar 2026)...");

  const financials = [
    [2026, 1, 28450.00, 25000.00, 18920.50, 20000.00, 9529.50, 0.3350],
    [2026, 2, 31200.00, 28000.00, 21340.75, 22000.00, 9859.25, 0.3160],
    [2026, 3, 34750.00, 32000.00, 23180.25, 24000.00, 11569.75, 0.3330],
  ];

  for (const [year, month, rev, budRev, exp, budExp, profit, margin] of financials) {
    await run(`
      INSERT INTO grit_media_group_llc_financials
        (year, month, revenue, budget_revenue, expenses, budget_expenses, net_profit, net_profit_margin)
      VALUES (${year}, ${month}, ${rev}, ${budRev}, ${exp}, ${budExp}, ${profit}, ${margin})
      ON CONFLICT (year, month) DO UPDATE SET
        revenue = EXCLUDED.revenue, budget_revenue = EXCLUDED.budget_revenue,
        expenses = EXCLUDED.expenses, budget_expenses = EXCLUDED.budget_expenses,
        net_profit = EXCLUDED.net_profit, net_profit_margin = EXCLUDED.net_profit_margin,
        updated_at = NOW()
    `, `Financials ${month}/${year}`);
  }

  // ─── STEP 5: Seed line items ────────────────────────────────────────────────
  console.log("\n📊 Seeding line items...");

  // Clear existing line items first to avoid duplicates
  await run(`DELETE FROM grit_media_group_llc_line_items`, "Clear existing line items");

  const lineItems = [
    // January income
    [2026, 1, 'income', 'Video Production Services', 12500.00],
    [2026, 1, 'income', 'Social Media Management', 8200.00],
    [2026, 1, 'income', 'Brand Strategy Consulting', 4750.00],
    [2026, 1, 'income', 'Content Creation Packages', 2000.00],
    [2026, 1, 'income', 'Photography Services', 1000.00],
    // January expenses
    [2026, 1, 'expense', 'Contractor Payments', 8500.00],
    [2026, 1, 'expense', 'Software & Subscriptions', 2340.50],
    [2026, 1, 'expense', 'Equipment & Gear', 3200.00],
    [2026, 1, 'expense', 'Marketing & Ads', 1880.00],
    [2026, 1, 'expense', 'Office & Utilities', 1500.00],
    [2026, 1, 'expense', 'Professional Services', 1500.00],
    // February income
    [2026, 2, 'income', 'Video Production Services', 14200.00],
    [2026, 2, 'income', 'Social Media Management', 8800.00],
    [2026, 2, 'income', 'Brand Strategy Consulting', 5200.00],
    [2026, 2, 'income', 'Content Creation Packages', 2000.00],
    [2026, 2, 'income', 'Photography Services', 1000.00],
    // February expenses
    [2026, 2, 'expense', 'Contractor Payments', 9800.00],
    [2026, 2, 'expense', 'Software & Subscriptions', 2340.75],
    [2026, 2, 'expense', 'Equipment & Gear', 2800.00],
    [2026, 2, 'expense', 'Marketing & Ads', 2400.00],
    [2026, 2, 'expense', 'Office & Utilities', 1500.00],
    [2026, 2, 'expense', 'Professional Services', 2500.00],
    // March income
    [2026, 3, 'income', 'Video Production Services', 16500.00],
    [2026, 3, 'income', 'Social Media Management', 9500.00],
    [2026, 3, 'income', 'Brand Strategy Consulting', 5750.00],
    [2026, 3, 'income', 'Content Creation Packages', 2000.00],
    [2026, 3, 'income', 'Photography Services', 1000.00],
    // March expenses
    [2026, 3, 'expense', 'Contractor Payments', 10500.00],
    [2026, 3, 'expense', 'Software & Subscriptions', 2340.25],
    [2026, 3, 'expense', 'Equipment & Gear', 3200.00],
    [2026, 3, 'expense', 'Marketing & Ads', 2640.00],
    [2026, 3, 'expense', 'Office & Utilities', 1500.00],
    [2026, 3, 'expense', 'Professional Services', 3000.00],
  ];

  const liValues = lineItems.map(([y, m, t, l, a]) =>
    `(${y}, ${m}, '${t}', '${l.replace(/'/g, "''")}', ${a})`
  ).join(",\n    ");

  await run(`
    INSERT INTO grit_media_group_llc_line_items (year, month, type, label, amount)
    VALUES ${liValues}
  `, `Line items: ${lineItems.length} rows`);

  // ─── STEP 6: Seed coaching items ────────────────────────────────────────────
  console.log("\n📊 Seeding coaching items...");
  await run(`DELETE FROM grit_media_group_llc_coaching`, "Clear existing coaching");

  await run(`
    INSERT INTO grit_media_group_llc_coaching (year, quarter, title, description, completed, sort_order)
    VALUES
      (2026, 1, 'Increase Monthly Recurring Revenue to $35K',
       'Focus on upselling existing clients to higher-tier packages and closing 2 new retainer clients.',
       false, 1),
      (2026, 1, 'Reduce Contractor Costs by 10%',
       'Audit current contractor agreements and renegotiate or replace with in-house capacity where feasible.',
       false, 2),
      (2026, 1, 'Launch Referral Program',
       'Implement a structured referral incentive for existing clients to generate 3+ qualified leads per month.',
       false, 3),
      (2026, 1, 'Build 3-Month Cash Reserve',
       'Allocate 15% of net profit monthly to a dedicated operating reserve account.',
       false, 4)
  `, "Coaching: 4 Q1 2026 items");

  // ─── STEP 7: Seed KPI metrics ───────────────────────────────────────────────
  console.log("\n📊 Seeding KPI metrics...");

  const kpis = [
    [2026, 1, 850.00, 0.0500, 8500.00],
    [2026, 2, 780.00, 0.0400, 9200.00],
    [2026, 3, 720.00, 0.0350, 9800.00],
  ];

  for (const [year, month, cac, churn, ltv] of kpis) {
    await run(`
      INSERT INTO grit_media_group_llc_kpi_metrics (year, month, cac, churn_rate, ltv)
      VALUES (${year}, ${month}, ${cac}, ${churn}, ${ltv})
      ON CONFLICT (year, month) DO UPDATE SET
        cac = EXCLUDED.cac, churn_rate = EXCLUDED.churn_rate, ltv = EXCLUDED.ltv,
        updated_at = NOW()
    `, `KPI ${month}/${year}`);
  }

  // ─── STEP 8: Seed time logs ─────────────────────────────────────────────────
  console.log("\n📊 Seeding time logs...");
  await run(`DELETE FROM grit_media_group_llc_time_logs`, "Clear existing time logs");

  const timeLogs = [
    [2026, 1, 'Client Delivery', 68.5, null],
    [2026, 1, 'Business Development', 22.0, null],
    [2026, 1, 'Operations & Admin', 18.5, 'Consider delegating invoicing to VA'],
    [2026, 1, 'Finance & Reporting', 8.0, null],
    [2026, 1, 'Team Management', 15.0, null],
    [2026, 2, 'Client Delivery', 72.0, null],
    [2026, 2, 'Business Development', 25.5, null],
    [2026, 2, 'Operations & Admin', 16.0, 'Automate onboarding checklist'],
    [2026, 2, 'Finance & Reporting', 7.5, null],
    [2026, 2, 'Team Management', 14.0, null],
    [2026, 3, 'Client Delivery', 78.0, null],
    [2026, 3, 'Business Development', 28.0, null],
    [2026, 3, 'Operations & Admin', 14.5, null],
    [2026, 3, 'Finance & Reporting', 8.0, null],
    [2026, 3, 'Team Management', 16.5, 'Delegate weekly team standups to ops lead'],
  ];

  const tlValues = timeLogs.map(([y, m, fa, h, dn]) =>
    `(${y}, ${m}, '${fa}', ${h}, ${dn ? `'${dn.replace(/'/g, "''")}'` : 'NULL'})`
  ).join(",\n    ");

  await run(`
    INSERT INTO grit_media_group_llc_time_logs (year, month, focus_area, hours, delegation_note)
    VALUES ${tlValues}
  `, `Time logs: ${timeLogs.length} rows`);

  // ─── STEP 9: Seed sales tracker ─────────────────────────────────────────────
  console.log("\n📊 Seeding sales tracker...");

  const sales = [
    [2026, 1, 3, 2, 1, 8],
    [2026, 2, 3, 3, 2, 10],
    [2026, 3, 4, 3, 3, 12],
  ];

  for (const [year, month, goal, signed, referral, outbound] of sales) {
    await run(`
      INSERT INTO grit_media_group_llc_sales_tracker
        (year, month, goal_clients, signed_clients, referral_count, outbound_count)
      VALUES (${year}, ${month}, ${goal}, ${signed}, ${referral}, ${outbound})
      ON CONFLICT (year, month) DO UPDATE SET
        goal_clients = EXCLUDED.goal_clients,
        signed_clients = EXCLUDED.signed_clients,
        referral_count = EXCLUDED.referral_count,
        outbound_count = EXCLUDED.outbound_count,
        updated_at = NOW()
    `, `Sales tracker ${month}/${year}`);
  }

  // ─── STEP 10: Seed client roster ────────────────────────────────────────────
  console.log("\n📊 Seeding client roster...");
  await run(`DELETE FROM client_roster WHERE tenant_slug = 'grit_media_group_llc'`, "Clear existing roster");

  await run(`
    INSERT INTO client_roster (tenant_slug, client_name, package_tier, monthly_fee, signed_at, status, total_income)
    VALUES
      ('grit_media_group_llc', 'Grit Media Group LLC', 'cfo', 2500.00, '2025-10-01', 'active', 7500.00),
      ('grit_media_group_llc', 'Apex Digital Solutions', 'growth_2', 1800.00, '2025-11-15', 'active', 5400.00),
      ('grit_media_group_llc', 'Horizon Realty Group', 'growth_1', 1200.00, '2025-09-01', 'active', 8400.00),
      ('grit_media_group_llc', 'Coastal Wellness Co.', 'momentum', 800.00, '2026-01-10', 'active', 2400.00),
      ('grit_media_group_llc', 'Summit Consulting LLC', 'legacy', 500.00, '2025-08-01', 'churned', 4000.00)
  `, "Client roster: 5 entries");

  // ─── STEP 11: Create portal_users records ───────────────────────────────────
  console.log("\n👤 Creating portal user records...");

  await run(`
    INSERT INTO portal_users (email, name, role, tenant_slug, must_reset_password)
    VALUES ('mechealleq@gmail.com', 'Mecheal', 'client', 'grit_media_group_llc', false)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      tenant_slug = EXCLUDED.tenant_slug,
      updated_at = NOW()
  `, "portal_users: mechealleq@gmail.com");

  await run(`
    INSERT INTO portal_users (email, name, role, tenant_slug, must_reset_password)
    VALUES ('admin@kynli.com', 'KynLi Admin', 'admin', NULL, false)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      updated_at = NOW()
  `, "portal_users: admin@kynli.com");

  // ─── Done ────────────────────────────────────────────────────────────────────
  await client.end();

  console.log("\n✅ Migration complete!");
  console.log("\n📝 Summary:");
  console.log("  - Global tables: portal_users, portal_tenants, client_roster");
  console.log("  - Per-client tables: 9 tables for grit_media_group_llc");
  console.log("  - Seed data: 3 months financials, 33 line items, 4 coaching goals,");
  console.log("    3 months KPI, 15 time log entries, 3 months sales, 5 roster entries");
  console.log("\n📝 Auth note:");
  console.log("  Supabase Auth users must be created via the dashboard or Auth API.");
  console.log("  portal_users records are ready — link supabase_uid after auth user creation.");
}

main().catch(err => {
  console.error("Fatal:", err);
  client.end().catch(() => {});
  process.exit(1);
});
