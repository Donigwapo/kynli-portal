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
