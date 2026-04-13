-- ============================================================
-- KynLi Portal — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─── Global: Portal Users ────────────────────────────────────────────────────
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
);

-- ─── Global: Portal Tenants ──────────────────────────────────────────────────
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
);

-- ─── Global: Client Roster ───────────────────────────────────────────────────
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
);

-- ─── Grit Media Group LLC: Financials ────────────────────────────────────────
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
);

-- ─── Grit Media Group LLC: Line Items ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grit_media_group_llc_line_items (
  id          BIGSERIAL PRIMARY KEY,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  label       TEXT NOT NULL,
  amount      NUMERIC(15,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Grit Media Group LLC: Documents ─────────────────────────────────────────
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
);

-- ─── Grit Media Group LLC: Coaching ──────────────────────────────────────────
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
);

-- ─── Grit Media Group LLC: KPI Metrics ───────────────────────────────────────
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
);

-- ─── Grit Media Group LLC: Time Logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grit_media_group_llc_time_logs (
  id              BIGSERIAL PRIMARY KEY,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL,
  focus_area      TEXT NOT NULL,
  hours           NUMERIC(8,2) DEFAULT 0,
  delegation_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Grit Media Group LLC: Sales Tracker ─────────────────────────────────────
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
);

-- ─── Grit Media Group LLC: Chat ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grit_media_group_llc_chat (
  id          BIGSERIAL PRIMARY KEY,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'admin')),
  sender_name TEXT NOT NULL,
  message     TEXT NOT NULL,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Grit Media Group LLC: AI Summaries ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS grit_media_group_llc_ai_summaries (
  id            BIGSERIAL PRIMARY KEY,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  content       TEXT NOT NULL,
  generated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month)
);

-- ─── Seed: Tenant ────────────────────────────────────────────────────────────
INSERT INTO portal_tenants (slug, company_name, contact_name, email, package_tier, is_active)
VALUES ('grit_media_group_llc', 'Grit Media Group LLC', 'Mecheal', 'mechealleq@gmail.com', 'cfo', true)
ON CONFLICT (slug) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  email        = EXCLUDED.email,
  updated_at   = NOW();

-- ─── Seed: Financials ────────────────────────────────────────────────────────
INSERT INTO grit_media_group_llc_financials
  (year, month, revenue, budget_revenue, expenses, budget_expenses, net_profit, net_profit_margin)
VALUES
  (2026, 1, 28450.00, 25000.00, 18920.50, 20000.00, 9529.50, 0.3350),
  (2026, 2, 31200.00, 28000.00, 21340.75, 22000.00, 9859.25, 0.3160),
  (2026, 3, 34750.00, 32000.00, 23180.25, 24000.00, 11569.75, 0.3330)
ON CONFLICT (year, month) DO UPDATE SET
  revenue = EXCLUDED.revenue, budget_revenue = EXCLUDED.budget_revenue,
  expenses = EXCLUDED.expenses, budget_expenses = EXCLUDED.budget_expenses,
  net_profit = EXCLUDED.net_profit, net_profit_margin = EXCLUDED.net_profit_margin,
  updated_at = NOW();

-- ─── Seed: Line Items ────────────────────────────────────────────────────────
DELETE FROM grit_media_group_llc_line_items;
INSERT INTO grit_media_group_llc_line_items (year, month, type, label, amount) VALUES
  -- January income
  (2026, 1, 'income', 'Video Production Services', 12500.00),
  (2026, 1, 'income', 'Social Media Management', 8200.00),
  (2026, 1, 'income', 'Brand Strategy Consulting', 4750.00),
  (2026, 1, 'income', 'Content Creation Packages', 2000.00),
  (2026, 1, 'income', 'Photography Services', 1000.00),
  -- January expenses
  (2026, 1, 'expense', 'Contractor Payments', 8500.00),
  (2026, 1, 'expense', 'Software & Subscriptions', 2340.50),
  (2026, 1, 'expense', 'Equipment & Gear', 3200.00),
  (2026, 1, 'expense', 'Marketing & Ads', 1880.00),
  (2026, 1, 'expense', 'Office & Utilities', 1500.00),
  (2026, 1, 'expense', 'Professional Services', 1500.00),
  -- February income
  (2026, 2, 'income', 'Video Production Services', 14200.00),
  (2026, 2, 'income', 'Social Media Management', 8800.00),
  (2026, 2, 'income', 'Brand Strategy Consulting', 5200.00),
  (2026, 2, 'income', 'Content Creation Packages', 2000.00),
  (2026, 2, 'income', 'Photography Services', 1000.00),
  -- February expenses
  (2026, 2, 'expense', 'Contractor Payments', 9800.00),
  (2026, 2, 'expense', 'Software & Subscriptions', 2340.75),
  (2026, 2, 'expense', 'Equipment & Gear', 2800.00),
  (2026, 2, 'expense', 'Marketing & Ads', 2400.00),
  (2026, 2, 'expense', 'Office & Utilities', 1500.00),
  (2026, 2, 'expense', 'Professional Services', 2500.00),
  -- March income
  (2026, 3, 'income', 'Video Production Services', 16500.00),
  (2026, 3, 'income', 'Social Media Management', 9500.00),
  (2026, 3, 'income', 'Brand Strategy Consulting', 5750.00),
  (2026, 3, 'income', 'Content Creation Packages', 2000.00),
  (2026, 3, 'income', 'Photography Services', 1000.00),
  -- March expenses
  (2026, 3, 'expense', 'Contractor Payments', 10500.00),
  (2026, 3, 'expense', 'Software & Subscriptions', 2340.25),
  (2026, 3, 'expense', 'Equipment & Gear', 3200.00),
  (2026, 3, 'expense', 'Marketing & Ads', 2640.00),
  (2026, 3, 'expense', 'Office & Utilities', 1500.00),
  (2026, 3, 'expense', 'Professional Services', 3000.00);

-- ─── Seed: Coaching ──────────────────────────────────────────────────────────
DELETE FROM grit_media_group_llc_coaching;
INSERT INTO grit_media_group_llc_coaching (year, quarter, title, description, completed, sort_order) VALUES
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
   false, 4);

-- ─── Seed: KPI Metrics ───────────────────────────────────────────────────────
INSERT INTO grit_media_group_llc_kpi_metrics (year, month, cac, churn_rate, ltv)
VALUES
  (2026, 1, 850.00, 0.0500, 8500.00),
  (2026, 2, 780.00, 0.0400, 9200.00),
  (2026, 3, 720.00, 0.0350, 9800.00)
ON CONFLICT (year, month) DO UPDATE SET
  cac = EXCLUDED.cac, churn_rate = EXCLUDED.churn_rate, ltv = EXCLUDED.ltv,
  updated_at = NOW();

-- ─── Seed: Time Logs ─────────────────────────────────────────────────────────
DELETE FROM grit_media_group_llc_time_logs;
INSERT INTO grit_media_group_llc_time_logs (year, month, focus_area, hours, delegation_note) VALUES
  (2026, 1, 'Client Delivery', 68.5, NULL),
  (2026, 1, 'Business Development', 22.0, NULL),
  (2026, 1, 'Operations & Admin', 18.5, 'Consider delegating invoicing to VA'),
  (2026, 1, 'Finance & Reporting', 8.0, NULL),
  (2026, 1, 'Team Management', 15.0, NULL),
  (2026, 2, 'Client Delivery', 72.0, NULL),
  (2026, 2, 'Business Development', 25.5, NULL),
  (2026, 2, 'Operations & Admin', 16.0, 'Automate onboarding checklist'),
  (2026, 2, 'Finance & Reporting', 7.5, NULL),
  (2026, 2, 'Team Management', 14.0, NULL),
  (2026, 3, 'Client Delivery', 78.0, NULL),
  (2026, 3, 'Business Development', 28.0, NULL),
  (2026, 3, 'Operations & Admin', 14.5, NULL),
  (2026, 3, 'Finance & Reporting', 8.0, NULL),
  (2026, 3, 'Team Management', 16.5, 'Delegate weekly team standups to ops lead');

-- ─── Seed: Sales Tracker ─────────────────────────────────────────────────────
INSERT INTO grit_media_group_llc_sales_tracker
  (year, month, goal_clients, signed_clients, referral_count, outbound_count)
VALUES
  (2026, 1, 3, 2, 1, 8),
  (2026, 2, 3, 3, 2, 10),
  (2026, 3, 4, 3, 3, 12)
ON CONFLICT (year, month) DO UPDATE SET
  goal_clients = EXCLUDED.goal_clients,
  signed_clients = EXCLUDED.signed_clients,
  referral_count = EXCLUDED.referral_count,
  outbound_count = EXCLUDED.outbound_count,
  updated_at = NOW();

-- ─── Seed: Client Roster ─────────────────────────────────────────────────────
DELETE FROM client_roster WHERE tenant_slug = 'grit_media_group_llc';
INSERT INTO client_roster (tenant_slug, client_name, package_tier, monthly_fee, signed_at, status, total_income)
VALUES
  ('grit_media_group_llc', 'Grit Media Group LLC', 'cfo', 2500.00, '2025-10-01', 'active', 7500.00),
  ('grit_media_group_llc', 'Apex Digital Solutions', 'growth_2', 1800.00, '2025-11-15', 'active', 5400.00),
  ('grit_media_group_llc', 'Horizon Realty Group', 'growth_1', 1200.00, '2025-09-01', 'active', 8400.00),
  ('grit_media_group_llc', 'Coastal Wellness Co.', 'momentum', 800.00, '2026-01-10', 'active', 2400.00),
  ('grit_media_group_llc', 'Summit Consulting LLC', 'legacy', 500.00, '2025-08-01', 'churned', 4000.00);

-- ─── Seed: Portal Users ──────────────────────────────────────────────────────
-- NOTE: Replace the supabase_uid values with the actual UUIDs from your Auth users
-- Client user UUID: 1fe8870f-ac77-4e8e-bd77-e46388edfbd8
-- Admin user UUID:  afea65ca-0c2f-410d-90cd-d9e6f3b85ea5
INSERT INTO portal_users (supabase_uid, email, name, role, tenant_slug, must_reset_password)
VALUES
  ('1fe8870f-ac77-4e8e-bd77-e46388edfbd8', 'mechealleq@gmail.com', 'Mecheal', 'client', 'grit_media_group_llc', false),
  ('afea65ca-0c2f-410d-90cd-d9e6f3b85ea5', 'admin@kynli.com', 'KynLi Admin', 'admin', NULL, false)
ON CONFLICT (email) DO UPDATE SET
  supabase_uid = EXCLUDED.supabase_uid,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  tenant_slug = EXCLUDED.tenant_slug,
  updated_at = NOW();
