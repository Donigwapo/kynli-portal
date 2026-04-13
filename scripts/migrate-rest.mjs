/**
 * migrate-rest.mjs
 * Uses Supabase REST API + Auth Admin API to:
 * 1. Create all required tables via the Management API SQL endpoint
 * 2. Seed all Grit Media Group LLC data via PostgREST
 * 3. Create Supabase Auth users via the Admin Auth API
 */

const SUPABASE_URL = "https://kibgbraksgztfmtwlabb.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpYmdicmFrc2d6dGZtdHdsYWJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDkxNTQ2OSwiZXhwIjoyMDY2NDkxNDY5fQ.zpTeyikb7Sg9p2Bwyixp4-H6YxecQZxoTvy1yJWvN3s";
const PROJECT_REF = "kibgbraksgztfmtwlabb";
const DB_PASSWORD = "O5NRw7GvjMueyx92";

const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Prefer": "return=minimal",
};

// ─── Run SQL via Supabase Management API ─────────────────────────────────────

async function runSQL(sql, label) {
  // Try Management API first (requires personal access token, may not work with service role)
  // Fallback: use the pg-meta endpoint
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (response.ok) {
    console.log(`  ✅ ${label}`);
    return true;
  }

  const text = await response.text();
  // If management API fails, try via pg-meta (internal Supabase endpoint)
  const pgMetaResponse = await fetch(
    `${SUPABASE_URL}/pg/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (pgMetaResponse.ok) {
    console.log(`  ✅ ${label}`);
    return true;
  }

  const pgText = await pgMetaResponse.text();
  console.error(`  ❌ ${label}: Management API: ${text.slice(0, 100)} | pg-meta: ${pgText.slice(0, 100)}`);
  return false;
}

// ─── Insert via PostgREST ─────────────────────────────────────────────────────

async function insert(table, data, label) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify(data),
  });

  if (response.ok || response.status === 201) {
    console.log(`  ✅ ${label}`);
    return true;
  }
  const text = await response.text();
  // Check for duplicate
  if (text.includes("duplicate") || text.includes("unique") || text.includes("23505")) {
    console.log(`  ℹ️  ${label} — already exists`);
    return true;
  }
  console.error(`  ❌ ${label}: ${response.status} ${text.slice(0, 150)}`);
  return false;
}

async function upsert(table, data, onConflict, label) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Prefer": `resolution=merge-duplicates,return=minimal`,
    },
    body: JSON.stringify(data),
  });

  if (response.ok || response.status === 201) {
    console.log(`  ✅ ${label}`);
    return true;
  }
  const text = await response.text();
  console.error(`  ❌ ${label}: ${response.status} ${text.slice(0, 150)}`);
  return false;
}

async function deleteRows(table, filter, label) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (response.ok) {
    console.log(`  ✅ Cleared ${label}`);
    return true;
  }
  const text = await response.text();
  console.error(`  ❌ Clear ${label}: ${text.slice(0, 100)}`);
  return false;
}

// ─── Create Supabase Auth User ────────────────────────────────────────────────

async function createAuthUser(email, password, metadata, label) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    }),
  });

  const data = await response.json();
  if (response.ok) {
    console.log(`  ✅ Auth user created: ${email} (${data.id})`);
    return data;
  }
  if (data.msg?.includes("already registered") || data.message?.includes("already")) {
    console.log(`  ℹ️  Auth user already exists: ${email}`);
    // Fetch existing user
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
    });
    const listData = await listRes.json();
    const existing = listData.users?.find(u => u.email === email);
    return existing || null;
  }
  console.error(`  ❌ ${label}: ${JSON.stringify(data).slice(0, 150)}`);
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 KynLi Portal — Supabase REST Migration");
  console.log("==========================================");

  // ─── STEP 1: Create tables via Management API ─────────────────────────────
  console.log("\n📋 Step 1: Creating tables via Management API...");

  const tables = [
    {
      name: "portal_users",
      sql: `CREATE TABLE IF NOT EXISTS portal_users (
        id                  BIGSERIAL PRIMARY KEY,
        supabase_uid        UUID UNIQUE,
        email               TEXT UNIQUE NOT NULL,
        name                TEXT,
        role                TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
        tenant_slug         TEXT,
        must_reset_password BOOLEAN DEFAULT TRUE,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: "portal_tenants",
      sql: `CREATE TABLE IF NOT EXISTS portal_tenants (
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
      )`
    },
    {
      name: "client_roster",
      sql: `CREATE TABLE IF NOT EXISTS client_roster (
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
      )`
    },
    {
      name: "grit_media_group_llc_financials",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_financials (
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
      )`
    },
    {
      name: "grit_media_group_llc_line_items",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_line_items (
        id          BIGSERIAL PRIMARY KEY,
        year        INTEGER NOT NULL,
        month       INTEGER NOT NULL,
        type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        label       TEXT NOT NULL,
        amount      NUMERIC(15,2) DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: "grit_media_group_llc_coaching",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_coaching (
        id          BIGSERIAL PRIMARY KEY,
        year        INTEGER NOT NULL,
        quarter     INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
        title       TEXT NOT NULL,
        description TEXT,
        completed   BOOLEAN DEFAULT FALSE,
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: "grit_media_group_llc_kpi_metrics",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_kpi_metrics (
        id          BIGSERIAL PRIMARY KEY,
        year        INTEGER NOT NULL,
        month       INTEGER NOT NULL,
        cac         NUMERIC(15,2) DEFAULT 0,
        churn_rate  NUMERIC(8,4) DEFAULT 0,
        ltv         NUMERIC(15,2) DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(year, month)
      )`
    },
    {
      name: "grit_media_group_llc_time_logs",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_time_logs (
        id              BIGSERIAL PRIMARY KEY,
        year            INTEGER NOT NULL,
        month           INTEGER NOT NULL,
        focus_area      TEXT NOT NULL,
        hours           NUMERIC(8,2) DEFAULT 0,
        delegation_note TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: "grit_media_group_llc_sales_tracker",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_sales_tracker (
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
      )`
    },
    {
      name: "grit_media_group_llc_chat",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_chat (
        id          BIGSERIAL PRIMARY KEY,
        sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'admin')),
        sender_name TEXT NOT NULL,
        message     TEXT NOT NULL,
        read        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: "grit_media_group_llc_ai_summaries",
      sql: `CREATE TABLE IF NOT EXISTS grit_media_group_llc_ai_summaries (
        id            BIGSERIAL PRIMARY KEY,
        year          INTEGER NOT NULL,
        month         INTEGER NOT NULL,
        content       TEXT NOT NULL,
        generated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(year, month)
      )`
    },
  ];

  let tablesCreated = 0;
  for (const t of tables) {
    const ok = await runSQL(t.sql, `Table: ${t.name}`);
    if (ok) tablesCreated++;
  }

  if (tablesCreated < tables.length) {
    console.log(`\n⚠️  ${tables.length - tablesCreated} tables may need manual creation.`);
    console.log("   Checking which tables exist via REST API...");
    for (const t of tables) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${t.name}?limit=0`, {
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` }
      });
      if (res.ok) {
        console.log(`  ✅ ${t.name} — exists`);
      } else {
        console.log(`  ❌ ${t.name} — MISSING (needs manual creation)`);
      }
    }
  }

  // ─── STEP 2: Seed tenant ──────────────────────────────────────────────────
  console.log("\n📊 Step 2: Seeding tenant...");
  await upsert("portal_tenants", {
    slug: "grit_media_group_llc",
    company_name: "Grit Media Group LLC",
    contact_name: "Mecheal",
    email: "mechealleq@gmail.com",
    package_tier: "cfo",
    is_active: true,
  }, "slug", "Tenant: Grit Media Group LLC");

  // ─── STEP 3: Seed financials ──────────────────────────────────────────────
  console.log("\n📊 Step 3: Seeding financials...");
  const financials = [
    { year: 2026, month: 1, revenue: 28450.00, budget_revenue: 25000.00, expenses: 18920.50, budget_expenses: 20000.00, net_profit: 9529.50, net_profit_margin: 0.3350 },
    { year: 2026, month: 2, revenue: 31200.00, budget_revenue: 28000.00, expenses: 21340.75, budget_expenses: 22000.00, net_profit: 9859.25, net_profit_margin: 0.3160 },
    { year: 2026, month: 3, revenue: 34750.00, budget_revenue: 32000.00, expenses: 23180.25, budget_expenses: 24000.00, net_profit: 11569.75, net_profit_margin: 0.3330 },
  ];
  await upsert("grit_media_group_llc_financials", financials, "year,month", "Financials: 3 months");

  // ─── STEP 4: Seed line items ──────────────────────────────────────────────
  console.log("\n📊 Step 4: Seeding line items...");
  // Delete existing first
  await deleteRows("grit_media_group_llc_line_items", "id=gte.0", "existing line items");

  const lineItems = [
    { year: 2026, month: 1, type: "income", label: "Video Production Services", amount: 12500.00 },
    { year: 2026, month: 1, type: "income", label: "Social Media Management", amount: 8200.00 },
    { year: 2026, month: 1, type: "income", label: "Brand Strategy Consulting", amount: 4750.00 },
    { year: 2026, month: 1, type: "income", label: "Content Creation Packages", amount: 2000.00 },
    { year: 2026, month: 1, type: "income", label: "Photography Services", amount: 1000.00 },
    { year: 2026, month: 1, type: "expense", label: "Contractor Payments", amount: 8500.00 },
    { year: 2026, month: 1, type: "expense", label: "Software & Subscriptions", amount: 2340.50 },
    { year: 2026, month: 1, type: "expense", label: "Equipment & Gear", amount: 3200.00 },
    { year: 2026, month: 1, type: "expense", label: "Marketing & Ads", amount: 1880.00 },
    { year: 2026, month: 1, type: "expense", label: "Office & Utilities", amount: 1500.00 },
    { year: 2026, month: 1, type: "expense", label: "Professional Services", amount: 1500.00 },
    { year: 2026, month: 2, type: "income", label: "Video Production Services", amount: 14200.00 },
    { year: 2026, month: 2, type: "income", label: "Social Media Management", amount: 8800.00 },
    { year: 2026, month: 2, type: "income", label: "Brand Strategy Consulting", amount: 5200.00 },
    { year: 2026, month: 2, type: "income", label: "Content Creation Packages", amount: 2000.00 },
    { year: 2026, month: 2, type: "income", label: "Photography Services", amount: 1000.00 },
    { year: 2026, month: 2, type: "expense", label: "Contractor Payments", amount: 9800.00 },
    { year: 2026, month: 2, type: "expense", label: "Software & Subscriptions", amount: 2340.75 },
    { year: 2026, month: 2, type: "expense", label: "Equipment & Gear", amount: 2800.00 },
    { year: 2026, month: 2, type: "expense", label: "Marketing & Ads", amount: 2400.00 },
    { year: 2026, month: 2, type: "expense", label: "Office & Utilities", amount: 1500.00 },
    { year: 2026, month: 2, type: "expense", label: "Professional Services", amount: 2500.00 },
    { year: 2026, month: 3, type: "income", label: "Video Production Services", amount: 16500.00 },
    { year: 2026, month: 3, type: "income", label: "Social Media Management", amount: 9500.00 },
    { year: 2026, month: 3, type: "income", label: "Brand Strategy Consulting", amount: 5750.00 },
    { year: 2026, month: 3, type: "income", label: "Content Creation Packages", amount: 2000.00 },
    { year: 2026, month: 3, type: "income", label: "Photography Services", amount: 1000.00 },
    { year: 2026, month: 3, type: "expense", label: "Contractor Payments", amount: 10500.00 },
    { year: 2026, month: 3, type: "expense", label: "Software & Subscriptions", amount: 2340.25 },
    { year: 2026, month: 3, type: "expense", label: "Equipment & Gear", amount: 3200.00 },
    { year: 2026, month: 3, type: "expense", label: "Marketing & Ads", amount: 2640.00 },
    { year: 2026, month: 3, type: "expense", label: "Office & Utilities", amount: 1500.00 },
    { year: 2026, month: 3, type: "expense", label: "Professional Services", amount: 3000.00 },
  ];
  await insert("grit_media_group_llc_line_items", lineItems, `Line items: ${lineItems.length} rows`);

  // ─── STEP 5: Seed coaching ────────────────────────────────────────────────
  console.log("\n📊 Step 5: Seeding coaching items...");
  await deleteRows("grit_media_group_llc_coaching", "id=gte.0", "existing coaching");
  await insert("grit_media_group_llc_coaching", [
    { year: 2026, quarter: 1, title: "Increase Monthly Recurring Revenue to $35K", description: "Focus on upselling existing clients to higher-tier packages and closing 2 new retainer clients.", completed: false, sort_order: 1 },
    { year: 2026, quarter: 1, title: "Reduce Contractor Costs by 10%", description: "Audit current contractor agreements and renegotiate or replace with in-house capacity where feasible.", completed: false, sort_order: 2 },
    { year: 2026, quarter: 1, title: "Launch Referral Program", description: "Implement a structured referral incentive for existing clients to generate 3+ qualified leads per month.", completed: false, sort_order: 3 },
    { year: 2026, quarter: 1, title: "Build 3-Month Cash Reserve", description: "Allocate 15% of net profit monthly to a dedicated operating reserve account.", completed: false, sort_order: 4 },
  ], "Coaching: 4 Q1 2026 items");

  // ─── STEP 6: Seed KPI metrics ─────────────────────────────────────────────
  console.log("\n📊 Step 6: Seeding KPI metrics...");
  await upsert("grit_media_group_llc_kpi_metrics", [
    { year: 2026, month: 1, cac: 850.00, churn_rate: 0.0500, ltv: 8500.00 },
    { year: 2026, month: 2, cac: 780.00, churn_rate: 0.0400, ltv: 9200.00 },
    { year: 2026, month: 3, cac: 720.00, churn_rate: 0.0350, ltv: 9800.00 },
  ], "year,month", "KPI metrics: 3 months");

  // ─── STEP 7: Seed time logs ───────────────────────────────────────────────
  console.log("\n📊 Step 7: Seeding time logs...");
  await deleteRows("grit_media_group_llc_time_logs", "id=gte.0", "existing time logs");
  await insert("grit_media_group_llc_time_logs", [
    { year: 2026, month: 1, focus_area: "Client Delivery", hours: 68.5, delegation_note: null },
    { year: 2026, month: 1, focus_area: "Business Development", hours: 22.0, delegation_note: null },
    { year: 2026, month: 1, focus_area: "Operations & Admin", hours: 18.5, delegation_note: "Consider delegating invoicing to VA" },
    { year: 2026, month: 1, focus_area: "Finance & Reporting", hours: 8.0, delegation_note: null },
    { year: 2026, month: 1, focus_area: "Team Management", hours: 15.0, delegation_note: null },
    { year: 2026, month: 2, focus_area: "Client Delivery", hours: 72.0, delegation_note: null },
    { year: 2026, month: 2, focus_area: "Business Development", hours: 25.5, delegation_note: null },
    { year: 2026, month: 2, focus_area: "Operations & Admin", hours: 16.0, delegation_note: "Automate onboarding checklist" },
    { year: 2026, month: 2, focus_area: "Finance & Reporting", hours: 7.5, delegation_note: null },
    { year: 2026, month: 2, focus_area: "Team Management", hours: 14.0, delegation_note: null },
    { year: 2026, month: 3, focus_area: "Client Delivery", hours: 78.0, delegation_note: null },
    { year: 2026, month: 3, focus_area: "Business Development", hours: 28.0, delegation_note: null },
    { year: 2026, month: 3, focus_area: "Operations & Admin", hours: 14.5, delegation_note: null },
    { year: 2026, month: 3, focus_area: "Finance & Reporting", hours: 8.0, delegation_note: null },
    { year: 2026, month: 3, focus_area: "Team Management", hours: 16.5, delegation_note: "Delegate weekly team standups to ops lead" },
  ], "Time logs: 15 rows");

  // ─── STEP 8: Seed sales tracker ───────────────────────────────────────────
  console.log("\n📊 Step 8: Seeding sales tracker...");
  await upsert("grit_media_group_llc_sales_tracker", [
    { year: 2026, month: 1, goal_clients: 3, signed_clients: 2, referral_count: 1, outbound_count: 8 },
    { year: 2026, month: 2, goal_clients: 3, signed_clients: 3, referral_count: 2, outbound_count: 10 },
    { year: 2026, month: 3, goal_clients: 4, signed_clients: 3, referral_count: 3, outbound_count: 12 },
  ], "year,month", "Sales tracker: 3 months");

  // ─── STEP 9: Seed client roster ───────────────────────────────────────────
  console.log("\n📊 Step 9: Seeding client roster...");
  await deleteRows("client_roster", "tenant_slug=eq.grit_media_group_llc", "existing roster");
  await insert("client_roster", [
    { tenant_slug: "grit_media_group_llc", client_name: "Grit Media Group LLC", package_tier: "cfo", monthly_fee: 2500.00, signed_at: "2025-10-01T00:00:00Z", status: "active", total_income: 7500.00 },
    { tenant_slug: "grit_media_group_llc", client_name: "Apex Digital Solutions", package_tier: "growth_2", monthly_fee: 1800.00, signed_at: "2025-11-15T00:00:00Z", status: "active", total_income: 5400.00 },
    { tenant_slug: "grit_media_group_llc", client_name: "Horizon Realty Group", package_tier: "growth_1", monthly_fee: 1200.00, signed_at: "2025-09-01T00:00:00Z", status: "active", total_income: 8400.00 },
    { tenant_slug: "grit_media_group_llc", client_name: "Coastal Wellness Co.", package_tier: "momentum", monthly_fee: 800.00, signed_at: "2026-01-10T00:00:00Z", status: "active", total_income: 2400.00 },
    { tenant_slug: "grit_media_group_llc", client_name: "Summit Consulting LLC", package_tier: "legacy", monthly_fee: 500.00, signed_at: "2025-08-01T00:00:00Z", status: "churned", total_income: 4000.00 },
  ], "Client roster: 5 entries");

  // ─── STEP 10: Create Auth users ───────────────────────────────────────────
  console.log("\n👤 Step 10: Creating Supabase Auth users...");

  const clientUser = await createAuthUser(
    "mechealleq@gmail.com",
    "KynLi2026!",
    { name: "Mecheal", tenant_slug: "grit_media_group_llc", role: "client" },
    "Client user"
  );

  const adminUser = await createAuthUser(
    "admin@kynli.com",
    "KynLiAdmin2026!",
    { name: "KynLi Admin", role: "admin" },
    "Admin user"
  );

  // ─── STEP 11: Seed portal_users ───────────────────────────────────────────
  console.log("\n👤 Step 11: Seeding portal_users...");

  await upsert("portal_users", {
    supabase_uid: clientUser?.id || null,
    email: "mechealleq@gmail.com",
    name: "Mecheal",
    role: "client",
    tenant_slug: "grit_media_group_llc",
    must_reset_password: false,
  }, "email", "portal_users: mechealleq@gmail.com");

  await upsert("portal_users", {
    supabase_uid: adminUser?.id || null,
    email: "admin@kynli.com",
    name: "KynLi Admin",
    role: "admin",
    tenant_slug: null,
    must_reset_password: false,
  }, "email", "portal_users: admin@kynli.com");

  // ─── Done ─────────────────────────────────────────────────────────────────
  console.log("\n✅ Migration complete!");
  console.log("\n📝 Test credentials:");
  console.log("  Client: mechealleq@gmail.com / KynLi2026!");
  console.log("  Admin:  admin@kynli.com / KynLiAdmin2026!");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
