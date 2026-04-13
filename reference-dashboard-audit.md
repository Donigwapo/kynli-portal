# Reference Dashboard Audit — kynlidash-6g9nvztm.manus.space

## Global Design
- **Theme:** Pure black background (`#000` or very dark), dark card surfaces (`#111`/`#1a1a1a`)
- **Accent colors:** Teal/cyan (`#00d4aa` approx) for positive values, red (`#ef4444`) for negative/churned, green for active/on-track
- **Typography:** Clean sans-serif, white text on dark
- **Sidebar:** Left sidebar, dark, logo top-left (IKC mark), nav items with icons, user profile bottom
- **Layout:** Full-height sidebar + main content area

## Tab Inventory

### 1. Overview (Strategic Overview)
- **Header:** "Strategic Overview" + "Latest period: Mar 2026" + Active Clients count (top right)
- **KPI Cards (4):** Revenue, Expenses, Net Profit, Net Profit Margin — each shows budget, % of budget, variance badge
- **Sales Target YTD:** Progress bar, Goal vs Actual, Referrals/Outbound/Referral Rate stats
- **Top 5 Income Sources:** List with teal progress bars, $ amount, % of total, budget line below
- **Top 5 Expenses:** List with red progress bars, $ amount, % of total, budget line below
- **2026 Revenue: Actuals vs Budget:** Combo chart — red bars (actual), dashed gold line (budget target), secondary axis showing % vs budget
- **Revenue & Profit Trend:** Line chart — teal (revenue), lighter teal (profit), full year projection
- **Active Clients by Tier:** Donut chart — Momentum/Growth 1/Growth 2/Accelerate/CFO/Legacy with counts
- **Q2 2026 Coaching Goals:** Simple list with Edit link

### 2. Clients (Client Roster)
- **Header:** "Client Roster" + "73 active clients · $74,655/mo MRR"
- **Package Summary Cards (5):** Momentum, Growth 1, Growth 2, Accelerate/CFO, Legacy — each shows active count, Avg/mo, Tenure, LTV
- **Search bar:** "Search by name, package, or status..."
- **Filter tabs:** All / Active / Churned + All Packages / Momentum / Growth 1 / Growth 2 / Accelerate/CFO / Legacy
- **Client count:** "115 clients" shown top right of table
- **Table columns:** Client (name + total income + tenure subtitle), Package (colored badge), Monthly ($), Signed (Month Year), Status (active/churned badge), Tenure (mo), LTV ($)
- **Edit/Delete buttons per row**
- **Add Client button** top right

### 3. Sales Tracker
- **Header:** "Sales Tracker" + subtitle "Goal: 4 new clients per month · Track your pipeline accountability"
- **KPI Cards (4):** YTD Target (48), YTD Actual (13), Achievement (27%), Referral Rate (0%)
- **2026 Annual Progress:** Progress bar with 0→48 scale, "27% achieved" label
- **Monthly Performance Chart:** Bar chart — teal bars (actual), dashed line (target=4), red bar for current month if below target
- **Monthly Breakdown Table:** Month, Target, Actual, Referrals, Outbound, Status (✓/✗ icons)
- **2025 Close Rate Reference:** Historical baseline — Proposals (38), Referrals (14), Close Rate (73%), insight text

### 4. Financials (Financial Data)
- **Header:** "Financial Data" + "Import your monthly P&L from Reach to update all dashboards"
- **Import Period button** top right
- **Period History list:** Collapsible rows — each shows Month Year, Rev, Exp, Profit, margin %
  - Empty months show 0.0% margin in grey
  - Months with data show profit in green/red based on value
- **Expanded view (per month):**
  - 3 cards: Revenue (actual + budget + variance), Expenses (actual + budget + variance), Net Profit (actual + budget + variance)
  - **Income Sources table:** Category, Actual, Budget, Variance columns
  - **Expenses table:** Category, Actual, Budget, Variance columns
  - Total Income row at bottom of income table
  - Total Expenses row at bottom of expenses table

### 5. Time Intelligence
- **Header:** "Time Intelligence" + "Where your time goes = where your results come from · 30h strategic / 10h fulfillment target"
- **Month/Year selectors** + Add Entry button
- **KPI Cards (4):** Total Hours, Strategic Hours (% + target), Fulfillment Hours, Top Focus Area
- **View tabs:** Overview / Entries / Trend
- **Overview tab:**
  - Strategic Split: progress bars for Strategic% vs Fulfillment%
  - Sales Coaching Goal: target hours, actual hours, progress bar, On Track badge
  - Focus Area Alignment: Radar/spider chart (Actual vs Target %)
  - Hours by Focus Area: list with colored bars, hours, %, variance vs target
  - Category Intelligence table: Category, What It Means, Focus Area, Owner, Hours
  - Team Member Hours section

### 6. Coaching
- (Could not access — redirected to login)
- Based on Overview snippet: Shows Q2 2026 coaching goals as a list with Edit link

### 7. Portal
- Navigation item — likely links to client portal

### 8. Reports & Analytics
- **Header:** "Reports & Analytics" + "Slice every metric by Year, Quarter, or Month"
- **Period selector:** Year / Quarter / Month toggle + year dropdown
- **Report type tabs:** Financial P&L / Client Analytics / Sales / Time / Profitability
- **Financial P&L tab:**
  - 4 KPI cards: Total Revenue, Total Expenses, Net Profit, Net Margin (each with budget + % vs target)
  - Monthly P&L Breakdown table: Month, Revenue, Budget, Variance, Expenses, Net Profit, Margin, Notes (Actual/Projection)
  - Revenue vs Budget chart
  - Top Income Sources: horizontal bar list with %
  - Top Expense Categories: horizontal bar list with %

## Key Design Patterns
- Cards: dark background, subtle border, rounded corners
- Badges: colored pill badges for status (active=green, churned=red, package tiers have distinct colors)
- Progress bars: thin, colored, with target markers
- Charts: Recharts-style, dark theme, teal/red/gold color scheme
- Tables: no heavy borders, subtle row separators, right-aligned numbers
- Variance: green for positive, red for negative, with +/- prefix
- Sidebar: persistent, dark, icons + labels, active item highlighted in teal
