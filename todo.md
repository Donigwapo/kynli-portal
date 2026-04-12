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

## Bug Fixes
- [x] Fix 404 on sidebar tab navigation — route mismatch between PortalLayout hrefs and App.tsx routes
- [x] Fix admin sidebar 404 — remove broken nav links (overview, sales, financials, time, coaching, reports) that have no registered routes
- [x] Create Grit Media Group LLC test tenant (Growth 1 tier)
- [x] Seed Jan/Feb/Mar 2026 financials + line items for Grit Media Group LLC
- [x] Remove admin redirect on login — all users go directly to /portal (client view)
- [ ] Auto-associate logged-in user with Grit Media Group LLC tenant data for demo
- [ ] Verify Overview, Financials, Reports, Coaching tabs display real Grit Media data

## UI Rebuild — Match Mockup Exactly
- [x] Overview tab — exact mockup match (header, 4 metric cards, sales target bar, top 5 income/expenses with budget sub-lines, combo revenue chart, trend + donut charts, coaching goals)
- [x] Financials tab — exact mockup match
- [x] Reports tab — exact mockup match
- [x] Coaching tab — exact mockup match
- [x] Document Vault (Portal) tab — exact mockup match
- [x] AI Summaries tab — exact mockup match
- [x] KPI Dashboard tab — exact mockup match
- [x] Time Intelligence tab — exact mockup match
- [x] Sales Tracker tab — exact mockup match

## Sidebar Fix
- [ ] Remove tier gating from sidebar — CFO build shows all tabs always
- [ ] Match exact nav order from mockup: Overview → Clients (TBD) → Sales Tracker → Financials → Time Intelligence → Coaching → Portal → Reports
- [ ] Match sidebar visual style from mockup screenshot (larger spacing, rounded active state with teal bg, arrow indicator on active)
