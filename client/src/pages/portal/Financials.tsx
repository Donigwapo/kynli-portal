import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function fmt(val: string | number | null | undefined, showSign = false): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  let str: string;
  if (abs >= 1_000_000) str = `$${(abs / 1_000_000).toFixed(1)}M`;
  else str = `$${abs.toLocaleString()}`;
  if (showSign && n > 0) return `+${str}`;
  if (n < 0) return `-${str}`;
  return str;
}

function num(val: string | number | null | undefined): number {
  return parseFloat(String(val ?? "0")) || 0;
}

function MarginBadge({ margin }: { margin: number }) {
  const color =
    margin >= 30 ? "text-green-400" :
    margin >= 15 ? "text-yellow-400" :
    margin > 0   ? "text-orange-400" :
    "text-muted-foreground";
  return <span className={`text-xs font-medium ${color}`}>{margin.toFixed(1)}% margin</span>;
}

function VarianceCell({ variance }: { variance: number }) {
  if (variance === 0) return <span className="text-muted-foreground">+$0</span>;
  const color = variance > 0 ? "text-green-400" : "text-red-400";
  return <span className={color}>{fmt(variance, true)}</span>;
}

type PeriodDetailProps = { year: number; month: number; tenantId: number | undefined };

function PeriodDetail({ year, month, tenantId }: PeriodDetailProps) {
  const { data: financials } = trpc.financials.get.useQuery({ year, tenantId });
  const period = (financials ?? []).find((f) => f.month === month);
  const { data: lineItems } = trpc.financials.lineItems.useQuery(
    { year, month, tenantId },
    { enabled: !!period }
  );

  if (!period) {
    return <div className="px-4 pb-4 text-xs text-muted-foreground">No data for this period.</div>;
  }

  const revenue = num(period.revenue);
  const expenses = num(period.expenses);
  const profit = num(period.netProfit);
  const budgetRevenue = num(period.budgetRevenue);
  const budgetExpenses = num(period.budgetExpenses);
  const budgetProfit = budgetRevenue - budgetExpenses;

  const incomeItems = (lineItems ?? []).filter((i) => i.type === "income");
  const expenseItems = (lineItems ?? []).filter((i) => i.type === "expense");

  return (
    <div className="px-4 pb-5 space-y-5 border-t border-border/50 pt-4">
      {/* 3-column metric summary */}
      <div className="grid grid-cols-3 gap-6">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Revenue</p>
          <p className="text-xl font-bold text-foreground">{fmt(revenue)}</p>
          {budgetRevenue > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-0.5">Budget: {fmt(budgetRevenue)}</p>
              <p className={`text-xs font-medium mt-0.5 ${revenue - budgetRevenue >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmt(revenue - budgetRevenue, true)}
              </p>
            </>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Expenses</p>
          <p className="text-xl font-bold text-foreground">{fmt(expenses)}</p>
          {budgetExpenses > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-0.5">Budget: {fmt(budgetExpenses)}</p>
              <p className={`text-xs font-medium mt-0.5 ${expenses - budgetExpenses <= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmt(expenses - budgetExpenses, true)}
              </p>
            </>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Net Profit</p>
          <p className={`text-xl font-bold ${profit >= 0 ? "text-foreground" : "text-red-400"}`}>{fmt(profit)}</p>
          {budgetProfit !== 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-0.5">Budget: {fmt(budgetProfit)}</p>
              <p className={`text-xs font-medium mt-0.5 ${profit - budgetProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmt(profit - budgetProfit, true)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Income Sources */}
      {incomeItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">Income Sources</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-muted-foreground font-medium pb-2 pr-4">Category</th>
                <th className="text-right text-muted-foreground font-medium pb-2 px-4">Actual</th>
                <th className="text-right text-muted-foreground font-medium pb-2 px-4">Budget</th>
                <th className="text-right text-muted-foreground font-medium pb-2">Variance</th>
              </tr>
            </thead>
            <tbody>
              {incomeItems.map((item) => {
                const amt = num(item.amount);
                return (
                  <tr key={item.id} className="border-b border-border/20">
                    <td className="py-2 text-foreground pr-4">{item.label}</td>
                    <td className="py-2 text-right text-foreground font-medium px-4">{fmt(amt)}</td>
                    <td className="py-2 text-right text-muted-foreground px-4">—</td>
                    <td className="py-2 text-right text-muted-foreground">—</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="py-2.5 font-semibold text-foreground pr-4">Total Income</td>
                <td className="py-2.5 text-right font-bold text-foreground px-4">{fmt(revenue)}</td>
                <td className="py-2.5 text-right text-muted-foreground px-4">
                  {budgetRevenue > 0 ? fmt(budgetRevenue) : "—"}
                </td>
                <td className="py-2.5 text-right">
                  {budgetRevenue > 0
                    ? <VarianceCell variance={revenue - budgetRevenue} />
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Expenses */}
      {expenseItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">Expenses</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-muted-foreground font-medium pb-2 pr-4">Category</th>
                <th className="text-right text-muted-foreground font-medium pb-2 px-4">Actual</th>
                <th className="text-right text-muted-foreground font-medium pb-2 px-4">Budget</th>
                <th className="text-right text-muted-foreground font-medium pb-2">Variance</th>
              </tr>
            </thead>
            <tbody>
              {expenseItems.map((item) => {
                const amt = num(item.amount);
                return (
                  <tr key={item.id} className="border-b border-border/20">
                    <td className="py-2 text-foreground pr-4">{item.label}</td>
                    <td className="py-2 text-right text-foreground font-medium px-4">{fmt(amt)}</td>
                    <td className="py-2 text-right text-muted-foreground px-4">—</td>
                    <td className="py-2 text-right text-muted-foreground">—</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="py-2.5 font-semibold text-foreground pr-4">Total Expenses</td>
                <td className="py-2.5 text-right font-bold text-foreground px-4">{fmt(expenses)}</td>
                <td className="py-2.5 text-right text-muted-foreground px-4">
                  {budgetExpenses > 0 ? fmt(budgetExpenses) : "—"}
                </td>
                <td className="py-2.5 text-right">
                  {budgetExpenses > 0
                    ? <VarianceCell variance={budgetExpenses - expenses} />
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {incomeItems.length === 0 && expenseItems.length === 0 && (
        <p className="text-xs text-muted-foreground">No line item detail available for this period.</p>
      )}
    </div>
  );
}

type AccordionRowProps = {
  year: number;
  month: number;
  tenantId: number | undefined;
  hasData: boolean;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
};

function AccordionRow({ year, month, tenantId, hasData, revenue, expenses, profit, margin }: AccordionRowProps) {
  const [open, setOpen] = useState(false);
  const label = `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-5 flex-wrap">
          <span className="text-sm font-semibold text-foreground w-36 shrink-0">{label}</span>
          <span className="text-xs text-muted-foreground">
            Rev: <span className="text-foreground">{hasData ? fmt(revenue) : "$0"}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Exp: <span className="text-foreground">{hasData ? fmt(expenses) : "$0"}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Profit:{" "}
            <span className={hasData && profit < 0 ? "text-red-400 font-medium" : "text-foreground font-medium"}>
              {hasData ? fmt(profit) : "$0"}
            </span>
          </span>
          <MarginBadge margin={hasData ? margin : 0} />
        </div>
        <div className="text-muted-foreground shrink-0 ml-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>
      {open && <PeriodDetail year={year} month={month} tenantId={tenantId} />}
    </div>
  );
}

export default function Financials() {
  const now = new Date();
  const currentYear = now.getFullYear();

  const { data: tenant } = trpc.tenant.me.useQuery(undefined);
  const tenantId = tenant?.id;

  const { data: allFinancials } = trpc.financials.get.useQuery(
    { year: currentYear, tenantId: undefined },
    { enabled: !!tenant }
  );
  const { data: prevFinancials } = trpc.financials.get.useQuery(
    { year: currentYear - 1, tenantId: undefined },
    { enabled: !!tenant }
  );
  const { data: prev2Financials } = trpc.financials.get.useQuery(
    { year: currentYear - 2, tenantId: undefined },
    { enabled: !!tenant }
  );

  // Build lookup: "year-month" → row
  const lookup: Record<string, { revenue: number; expenses: number; profit: number; margin: number }> = {};
  [...(allFinancials ?? []), ...(prevFinancials ?? []), ...(prev2Financials ?? [])].forEach((f) => {
    lookup[`${f.year}-${f.month}`] = {
      revenue: num(f.revenue),
      expenses: num(f.expenses),
      profit: num(f.netProfit),
      margin: num(f.margin),
    };
  });

  // Build period list: from current month down, 3 years back
  const periods: { year: number; month: number }[] = [];
  for (const y of [currentYear, currentYear - 1, currentYear - 2]) {
    for (let m = 12; m >= 1; m--) {
      if (y === currentYear && m > now.getMonth() + 1) continue;
      periods.push({ year: y, month: m });
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Data</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View your monthly P&amp;L data and line item breakdowns
          </p>
        </div>
      </div>

      {/* Period History Accordion */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Period History</h2>
        </div>
        {periods.length === 0 ? (
          <p className="px-4 py-8 text-xs text-muted-foreground text-center">No financial data available.</p>
        ) : (
          periods.map(({ year, month }) => {
            const key = `${year}-${month}`;
            const data = lookup[key];
            return (
              <AccordionRow
                key={key}
                year={year}
                month={month}
                tenantId={tenantId}
                hasData={!!data}
                revenue={data?.revenue ?? 0}
                expenses={data?.expenses ?? 0}
                profit={data?.profit ?? 0}
                margin={data?.margin ?? 0}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
