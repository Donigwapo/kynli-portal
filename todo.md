# KynLi Portal — Project TODO

## Phase 1: Foundation
- [x] Database schema: users, tenants, financials, documents, coaching_items, kpi_metrics, time_logs, sales_tracker, ai_summaries
- [x] Unique composite indexes for upsert tables (financials, kpi, sales, ai_summaries)
- [x] Global theme: dark background, teal/cyan accent, KynLi branding
- [x] Inter font
- [x] Shared tier types, labels, colors, and hasAccess() helper

## Phase 2: Auth & Routing
- [x] Landing/login page with KynLi branding
- [x] Auth redirect (admin → /admin, client → /portal)
- [x] PortalContext (impersonation state, effectiveTier)
- [x] Package tier stored on tenant profile
- [x] Protected routes for client portal and admin

## Phase 3: CFO Portal Shell
- [x] PortalLayout sidebar with collapsible nav, tier badge, impersonation banner
- [x] Tab visibility gated by tier via TAB_ACCESS + hasAccess()
- [x] Overview/Dashboard page with metric cards and quick access grid
- [x] App.tsx routes wired for all portal and admin pages

## Phase 4: Financials & Reports
- [x] Financials tab (revenue, expenses, net profit, margin, top 5 income/expenses, bar chart)
- [x] Reports tab (annual summary, line charts, monthly breakdown table)

## Phase 5: Document Vault
- [x] Document Vault tab (grouped by year, download/view, empty state)
- [x] Document upload via S3 (admin side)
- [x] File metadata stored in DB (name, year, url, tenant_id)

## Phase 6: CFO-Specific Tabs
- [x] AI Summaries tab (LLM-generated monthly summary, markdown render)
- [x] Coaching & Accountability tab (quarterly goals, checkbox toggle, progress bar)
- [x] KPI Dashboard tab (CAC, Churn, LTV cards + trend charts)
- [x] Time Intelligence tab (hours breakdown, pie chart, delegation suggestions)
- [x] Sales Tracker tab (goal progress bar, referral vs outbound breakdown)

## Phase 7: Admin Portal
- [x] Admin Client Management page (table, search, tier filter)
- [x] GHL Notes dialog per client
- [x] Client impersonation (View as client → portal with their tier)
- [x] Add Client dialog
- [x] Admin Data Entry page (financials, line items, coaching, documents, KPI, time, sales, AI summary)

## Phase 8: Backend
- [x] tRPC routers for all features
- [x] DB helpers for all tables
- [x] AI summary generation via LLM
- [x] TypeScript check passing (0 errors)
- [x] Vitest tests passing

## Phase 9: Delivery
- [x] Checkpoint saved
- [x] Live URL delivered to user

## Pending / Future
- [ ] 2FA setup for client login
- [ ] Multi-tenant email enrollment flow
- [ ] Build out Legacy, Momentum, Growth 1, Growth 2 portal variants
- [ ] Admin: drag-and-drop document upload UI improvement
- [ ] Admin: edit/delete coaching items from UI
- [ ] Admin: edit/delete line items from UI

## Phase 10: Supabase Migration
- [x] Install @supabase/supabase-js
- [x] Create server/supabase.ts with admin client and all data query helpers
- [x] Run DDL SQL in Supabase dashboard (14 tables: portal_users, portal_tenants, + 12 per-client tables for grit_media_group_llc)
- [x] Seed Grit Media Group LLC: 3 months financials (Jan-Mar 2026), line items, coaching goals (Q1 2026), KPI metrics, time logs, sales tracker, client roster
- [x] Create Supabase Auth users: mechealleq@gmail.com (client) + admin@kynli.com (admin)
- [x] Seed portal_users and portal_tenants tables
- [x] Replace Manus OAuth with Supabase email+password auth (server/auth.ts)
- [x] Update server/_core/context.ts to use JWT session cookie (Supabase-based)
- [x] Update server/_core/index.ts to register Supabase auth routes + install cookie-parser
- [x] Create client/src/pages/Login.tsx with email+password form
- [x] Add /login route to App.tsx
- [x] Update RouteGuard.tsx, useAuth.ts, Home.tsx to use /login instead of Manus OAuth
- [x] Rewrite server/routers.ts to use Supabase helpers instead of Drizzle/MySQL
- [x] Fix all frontend files: tenantId → tenantSlug, camelCase → snake_case field names
- [x] Fix PortalContext.tsx, PortalLayout.tsx, AdminClients.tsx, AdminDataEntry.tsx
- [x] All 4 vitest tests passing (supabase.test.ts + auth.logout.test.ts)
- [x] End-to-end API test: login → auth.me → financials.get → coaching.list all pass

## Bug Fixes
- [x] Fix tRPC API returning HTML instead of JSON on /portal/financials (was accidental button click, not a real bug)

## Phase 11: Financials Summary + AI Summaries Removal
- [x] Add `summary` text column to financials table in Supabase (ALTER TABLE)
- [x] Update server/supabase.ts financials query to include summary field
- [x] Update server/routers.ts financials.upsert to accept summary field
- [x] Remove AI Summaries tab from PortalLayout nav
- [x] Remove /portal/ai-summaries route from App.tsx
- [x] Add collapsible monthly summary dropdown to Financials.tsx
- [x] Update AdminDataEntry.tsx financials form to include summary textarea
- [x] Add financials.updateSummary tRPC procedure (PATCH-only, no financial figure overwrite)
- [x] Add dedicated Monthly Summary tab in AdminDataEntry.tsx
  Note: Summary entry intentionally lives in a dedicated "Monthly Summary" tab (not the Financials form) to prevent accidental overwrites of financial figures.

## Phase 12: Client Roster Tab
- [x] Create grit_media_group_llc_client_roster table in Supabase
- [x] Add ClientRosterEntry type and helpers to server/supabase.ts
- [x] Add clientRoster tRPC procedures (list, upsert, delete) to routers.ts
- [x] Build Clients.tsx portal page with package summary cards, search, filter tabs, sortable table
- [x] Wire Clients tab into PortalLayout nav and App.tsx routes
- [x] Add client roster CRUD to AdminDataEntry.tsx (inline Add/Edit/Delete dialog on Clients page — admin-only)
- [x] TypeScript: 0 errors, 4/4 tests passing

## Phase 13: Client Roster — Package Update + Client CRUD
- [x] Update package names to Grit Media service bundles: Video Production, Social Media, Brand Strategy, Content + Photo, Full Service
- [x] Add default monthly amounts per package based on financials
- [x] Seed existing Grit Media clients from sales tracker / other tables (no individual client names in seeded data — roster starts empty)
- [x] Enable client-side CRUD (add/edit/delete) on Clients page — available to all users
- [x] Update package filter cards to show Grit Media service names
- [x] TypeScript: 0 errors, 4/4 tests passing

## Phase 14: Full UI Redesign — Reference Dashboard Match
- [x] Rebuild Overview.tsx — 4 KPI cards, sales target progress, client roster snapshot, top income/expenses, bar chart, area chart, coaching goals
- [x] Rebuild SalesTracker.tsx — 4 KPI cards, annual goal progress bar, monthly bar chart, monthly breakdown table with totals
- [x] Rebuild TimeIntelligence.tsx — 4 KPI cards, strategic vs operational split, radar chart, hours breakdown table, delegation suggestions
- [x] Rebuild Coaching.tsx — quarter progress bar, goal checklist with toggle/delete, stats summary, add goal dialog
- [x] Rebuild Reports.tsx — 4 KPI cards, revenue/budget/expenses line chart, net profit bar chart, monthly breakdown table with totals
- [x] Remove double-wrapping PortalLayout from all rebuilt pages (PortalRoute already wraps)
- [x] TypeScript: 0 errors after all rebuilds
