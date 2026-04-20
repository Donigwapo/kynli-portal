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

## Phase 15: Category Intelligence (AI Analysis)
- [x] Extend task_categories schema with description, ownerName, ownerRole fields
- [x] Add category_intelligence table for AI analysis results (DB migration pushed)
- [x] Server: updateTaskCategoryMeta mutation
- [x] Server: getCategoryIntelligence query
- [x] Server: runCategoryIntelligence mutation (LLM-powered, aggregates logs, upserts results)
- [x] Frontend: Category Intelligence panel with inline category metadata editor (description, owner name, role)
- [x] Frontend: AI analysis table — Category, What It Means, Focus Area (color-coded), Owner/Delegate badge, Hours %
- [x] Frontend: Expert's Trap and Delegatable flags from AI
- [x] Frontend: Team Member Hours horizontal bar chart (computed from logs, no AI needed)

## Phase 16: Chat Section
- [x] Add chat_messages table to drizzle schema (tenantId, senderUserId, senderName, senderRole, body, fileKey, fileUrl, fileName, fileSize, mimeType, archiveYear, archiveMonth, portalDocumentId)
- [x] Push DB migration (pnpm db:push)
- [x] Add getChatMessages, insertChatMessage, deleteChatMessage helpers to server/db.ts
- [x] Fix insertDocument to return inserted row (needed for portalDocumentId linking)
- [x] Add chat.list, chat.send, chat.sendFile, chat.delete tRPC procedures to routers.ts
- [x] sendFile: uploads to S3, auto-archives to portal documents table (correct month/year), notifies admin
- [x] Build Chat.tsx page: message bubbles (own=right/teal, others=left/dark), file attachments, image preview, polling every 3s
- [x] Add Chat nav item to PortalLayout sidebar (MessageSquare icon)
- [x] Register /portal/chat route in App.tsx
- [x] TypeScript: 0 errors

## Phase 17: Migrate Chat to Supabase
- [x] Extend ChatMessage type in supabase.ts to include file fields (file_url, file_name, file_size, mime_type, archive_year, archive_month, portal_document_id, sender_user_id)
- [x] Update getChatMessages, insertChatMessage, deleteChatMessage in supabase.ts to use {slug}_chat table with extended schema
- [x] Add SQL DDL comment for extending existing {slug}_chat tables in Supabase (ALTER TABLE)
- [x] Rewire chat.list, chat.send, chat.sendFile, chat.delete in routers.ts to use Supabase helpers
- [x] Remove dependency on Drizzle chat helpers (getChatMessages/insertChatMessage/deleteChatMessage from db.ts) for chat procedures
- [x] TypeScript: 0 errors

## Phase 18: Package Tier Feature Gating
- [x] Create shared/tiers.ts with PACKAGE_TIERS, TAB_ACCESS feature matrix, PackageTier type, hasAccess() helper
- [x] Update PortalLayout sidebar nav to hide/show items based on user's packageTier
- [x] Add TierGate route guard component that shows upgrade message for unauthorized tier access
- [x] Wrap all restricted routes in App.tsx with TierGate using featureKey props
- [x] Add assertTierAccess() helper to routers.ts (admin bypass + tier check)
- [x] Backend tier guards added: coaching.list/toggle/getNote/saveNote, kpi.get, time.getByYear, sales.get/getByYear, roster.list/add/update/delete
- [x] TypeScript: 0 errors

## Phase 19: Chat Upgrades — Persistent History, Search, Timestamps, Threaded Replies
- [x] Supabase SQL migration: add thread_id (parent message FK), reply_count, search index to {slug}_chat tables
- [x] Extend ChatMessage type with thread_id, reply_count fields
- [x] Update getChatMessages to support search query filter (ilike on message field)
- [x] Add chat.sendReply tRPC procedure (reply to a thread, sets thread_id)
- [x] Add chat.getThread tRPC procedure (fetch all replies for a parent message)
- [x] Fix persistent history: increase default limit to 200 (no polling during search), messages always fetched from Supabase
- [x] Chat.tsx: Slack-style date dividers (Today / Yesterday / Apr 15, 2026)
- [x] Chat.tsx: Full timestamp on hover (exact date + time tooltip on bubble header)
- [x] Chat.tsx: Search bar in header — debounced server-side ilike search, result count shown
- [x] Chat.tsx: Reply button on hover → opens thread panel (right-side panel)
- [x] Chat.tsx: Thread panel shows parent message (quoted) + all replies, reply input at bottom, 3s polling
- [x] Chat.tsx: Reply count badge on parent messages that have replies (clickable to open thread)
- [x] TypeScript: 0 errors

## Phase 19b: Chat — Load More Pagination
- [x] Chat.tsx: "Load earlier messages" button at top of feed (fetches beforeId = oldest message id)
- [x] Append older messages above current list without losing scroll position (scroll preserved via scrollHeight delta)
- [x] TypeScript: 0 errors

## Phase 20: Document Portal — MIME-aware display + chat archive fix
- [x] Fix document card: show "Open Image" for images, "Open File" for non-PDF/non-image, "Open PDF" only for PDFs
- [x] Show inline image thumbnail on document cards for image MIME types
- [x] Add "Chat Attachment" type color (cyan) to DOC_TYPE_COLORS
- [x] Fix chat.sendFile: docData was missing month and file_size — files were never saved to {slug}_documents
- [x] Add month and file_size fields to Document type in supabase.ts
- [x] Improve error logging in sendFile archive block (was silently swallowing errors)
- [x] TypeScript: 0 errors

## Phase 20b: Supabase — documents table migration
- [ ] Run migration to add month and file_size columns to {slug}_documents tables
