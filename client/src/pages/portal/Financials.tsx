import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, FileText, TrendingUp, TrendingDown, DollarSign, Percent, Upload, X, Trash2, Sparkles, History } from "lucide-react";
import { usePortal } from "../../contexts/PortalContext";
import { trpc } from "../../lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";

function fmtD(val: number | string | null | undefined) {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(0)}k`;
  return `${prefix}$${abs.toLocaleString()}`;
}
function fmtN(val: number | string | null | undefined): number {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  return isNaN(n) ? 0 : n;
}
function variance(actual: number, budget: number) {
  const v = actual - budget;
  const pct = budget !== 0 ? ((actual / budget) * 100 - 100) : 0;
  return { v, pct, isGood: v >= 0 };
}
function varianceExpense(actual: number, budget: number) {
  const v = actual - budget;
  const pct = budget !== 0 ? ((actual / budget) * 100 - 100) : 0;
  return { v, pct, isGood: v <= 0 };
}

type ReviewSpecialTotals = {
  totalCostOfGoodsSold: { actual: string; budget: string };
  totalOtherIncome: { actual: string; budget: string };
  totalOtherExpense: { actual: string; budget: string };
};

function defaultReviewSpecialTotals(): ReviewSpecialTotals {
  return {
    totalCostOfGoodsSold: { actual: "0", budget: "" },
    totalOtherIncome: { actual: "0", budget: "" },
    totalOtherExpense: { actual: "0", budget: "" },
  };
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function VarianceBadge({ v, pct, isGood }: { v: number; pct: number; isGood: boolean }) {
  const color = isGood ? GREEN : RED;
  const sign = v >= 0 ? "+" : "";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {sign}{fmtD(v)} ({sign}{pct.toFixed(1)}%)
    </span>
  );
}

function MonthlySummaryPanel({
  summary,
  month,
  year,
  summaryExpanded,
  onToggleSummaryExpanded,
  summaryId,
}: {
  summary?: string | null;
  month: number;
  year: number;
  summaryExpanded: boolean;
  onToggleSummaryExpanded: () => void;
  summaryId: string;
}) {
  const normalizedSummary = typeof summary === "string" ? summary.trim() : "";
  if (!normalizedSummary) return null;
  const shouldClamp = normalizedSummary.length > 500;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-foreground font-medium text-sm">
        <FileText className="w-4 h-4 text-primary" />
        {MONTHS_LONG[month - 1]} {year} — Monthly Summary
      </div>
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="text-xs font-semibold text-primary mb-2">Cameron’s Financial Summary</div>
        <p
          id={summaryId}
          className={[
            "text-sm text-foreground/90 leading-6 whitespace-pre-wrap break-words",
            shouldClamp && !summaryExpanded ? "line-clamp-5" : "",
          ].join(" ")}
        >
          {normalizedSummary}
        </p>
        {shouldClamp && (
          <button
            type="button"
            className="mt-2 text-xs text-primary hover:underline"
            aria-expanded={summaryExpanded}
            aria-controls={summaryId}
            aria-label={`${summaryExpanded ? "Collapse" : "Show full"} Cameron’s Financial Summary for ${MONTHS_LONG[month - 1]} ${year}`}
            onClick={onToggleSummaryExpanded}
          >
            {summaryExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

function PeriodRow({
  period, onExpand, isExpanded,
}: {
  period: {
    year: number;
    month: number;
    revenue: number;
    expenses: number;
    cogs_actual?: number;
    other_income_actual?: number;
    other_expense_actual?: number;
    net_profit: number;
    net_profit_margin: number;
    budget_revenue: number;
    budget_expenses: number;
    cogs_budget?: number | null;
    other_income_budget?: number | null;
    other_expense_budget?: number | null;
    summary?: string | null;
  };
  onExpand: () => void;
  isExpanded: boolean;
}) {
  const rev = fmtN(period.revenue);
  const exp = fmtN(period.expenses);
  const cogs = fmtN(period.cogs_actual);
  const otherIncome = fmtN(period.other_income_actual);
  const otherExpense = fmtN(period.other_expense_actual);
  const profit = rev - cogs - exp + otherIncome - otherExpense;
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  const budRev = fmtN(period.budget_revenue);
  const budExp = fmtN(period.budget_expenses);
  const cogsBudget = fmtN(period.cogs_budget);
  const otherIncomeBudget = fmtN(period.other_income_budget);
  const otherExpenseBudget = fmtN(period.other_expense_budget);
  const budgetNetProfit = budRev - cogsBudget - budExp + otherIncomeBudget - otherExpenseBudget;
  const revVar = variance(rev, budRev);
  const expVar = varianceExpense(exp, budExp);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={onExpand}
        className="w-full flex items-center justify-between px-5 py-4 bg-card hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="font-semibold text-foreground text-sm">
            {MONTHS_LONG[period.month - 1]} {period.year}
          </span>
        </div>
        <div className="flex items-center gap-8 text-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Revenue</div>
            <div className="font-semibold text-foreground">{fmtD(rev)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Expenses</div>
            <div className="font-semibold text-foreground">{fmtD(exp)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">COGS</div>
            <div className="font-semibold text-foreground">{fmtD(cogs)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Net Profit</div>
            <div className="font-semibold" style={{ color: profit >= 0 ? GREEN : RED }}>{fmtD(profit)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Net Margin</div>
            <div className="font-semibold" style={{ color: margin >= 35 ? GREEN : RED }}>{margin.toFixed(1)}%</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Rev vs Budget</div>
            <VarianceBadge {...revVar} />
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Net vs Budget</div>
            <VarianceBadge {...variance(profit, budgetNetProfit)} />
          </div>
        </div>
      </button>
    </div>
  );
}

function ExpandedPeriodDetail({
  period,
  lineItems,
  summaryExpanded,
  onToggleSummaryExpanded,
}: {
  period: {
    year: number;
    month: number;
    revenue: number;
    expenses: number;
    cogs_actual?: number;
    cogs_budget?: number | null;
    other_income_actual?: number;
    other_income_budget?: number | null;
    other_expense_actual?: number;
    other_expense_budget?: number | null;
    net_profit: number;
    net_profit_margin: number;
    budget_revenue: number;
    budget_expenses: number;
    summary?: string | null;
    id?: string | number;
  };
  lineItems: { id: number; label: string; type: string; amount: number; budget_amount?: number | null }[];
  summaryExpanded: boolean;
  onToggleSummaryExpanded: () => void;
}) {
  const income = lineItems.filter(i => i.type === "income");
  const expenses = lineItems.filter(i => i.type === "expense");
  const totalRev = fmtN(period.revenue);
  const operatingExp = fmtN(period.expenses);
  const cogs = fmtN(period.cogs_actual);
  const otherIncome = fmtN(period.other_income_actual);
  const otherExpense = fmtN(period.other_expense_actual);
  const budRev = fmtN(period.budget_revenue);
  const budOperatingExp = fmtN(period.budget_expenses);
  const cogsBudget = fmtN(period.cogs_budget);
  const otherIncomeBudget = fmtN(period.other_income_budget);
  const otherExpenseBudget = fmtN(period.other_expense_budget);

  const grossProfit = totalRev - cogs;
  const profit = totalRev - cogs - operatingExp + otherIncome - otherExpense;
  const margin = totalRev > 0 ? (profit / totalRev) * 100 : 0;
  const budgetGrossProfit = budRev - cogsBudget;
  const budgetNetProfit = budRev - cogsBudget - budOperatingExp + otherIncomeBudget - otherExpenseBudget;
  const budgetMargin = budRev > 0 ? (budgetNetProfit / budRev) * 100 : 0;

  return (
    <div className="border border-t-0 border-border rounded-b-xl bg-background px-5 py-5 space-y-5">
      {/* Summary */}
      <MonthlySummaryPanel
        summary={period.summary}
        month={period.month}
        year={period.year}
        summaryExpanded={summaryExpanded}
        onToggleSummaryExpanded={onToggleSummaryExpanded}
        summaryId={`saved-summary-${period.id ?? `${period.year}-${period.month}`}`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Revenue", value: fmtD(totalRev), budget: fmtD(budRev), var: variance(totalRev, budRev), icon: <DollarSign size={14} /> },
          { label: "COGS", value: fmtD(cogs), budget: fmtD(cogsBudget), var: varianceExpense(cogs, cogsBudget), icon: <TrendingDown size={14} /> },
          { label: "Operating Expenses", value: fmtD(operatingExp), budget: fmtD(budOperatingExp), var: varianceExpense(operatingExp, budOperatingExp), icon: <TrendingDown size={14} /> },
          { label: "Net Profit", value: fmtD(profit), budget: fmtD(budgetNetProfit), var: variance(profit, budgetNetProfit), icon: <TrendingUp size={14} /> },
          { label: "Net Margin", value: `${margin.toFixed(1)}%`, budget: `${budgetMargin.toFixed(1)}%`, var: { v: margin - budgetMargin, pct: margin - budgetMargin, isGood: margin >= budgetMargin }, icon: <Percent size={14} /> },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <span className="text-muted-foreground">{card.icon}</span>
            </div>
            <div className="text-xl font-bold text-foreground mb-1">{card.value}</div>
            <div className="text-xs text-muted-foreground mb-1">Budget: {card.budget}</div>
            <VarianceBadge {...card.var} />
          </div>
        ))}
      </div>

      {/* Special totals + Income + Expense tables */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Special Totals</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Category</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Actual</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Budget</th>
              <th className="text-right px-4 py-2 text-muted-foreground font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Cost of Goods Sold", actual: cogs, budget: cogsBudget, expenseLike: true },
              { label: "Other Income", actual: otherIncome, budget: otherIncomeBudget, expenseLike: false },
              { label: "Other Expense", actual: otherExpense, budget: otherExpenseBudget, expenseLike: true },
            ].map((row) => {
              const rowVariance = row.expenseLike ? varianceExpense(row.actual, row.budget) : variance(row.actual, row.budget);
              return (
                <tr key={row.label} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-foreground">{row.label}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">{fmtD(row.actual)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtD(row.budget)}</td>
                  <td className="px-4 py-2.5 text-right"><VarianceBadge {...rowVariance} /></td>
                </tr>
              );
            })}
            <tr className="border-t border-border bg-muted/20">
              <td className="px-4 py-2.5 font-semibold text-foreground">Gross Profit</td>
              <td className="px-4 py-2.5 text-right font-bold text-foreground">{fmtD(grossProfit)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">{fmtD(budgetGrossProfit)}</td>
              <td className="px-4 py-2.5 text-right"><VarianceBadge {...variance(grossProfit, budgetGrossProfit)} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Income table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Income Breakdown</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Source</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Actual</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Budget</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {income.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No income data</td></tr>
              ) : income.map(item => {
                const amt = fmtN(item.amount);
                const bud = fmtN(item.budget_amount);
                const v = variance(amt, bud);
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-foreground">{item.label}</td>
                    <td className="px-4 py-2.5 text-right font-medium" style={{ color: TEAL }}>{fmtD(amt)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{bud > 0 ? fmtD(bud) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">{bud > 0 ? <VarianceBadge {...v} /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/20">
                <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: TEAL }}>{fmtD(totalRev)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">{budRev > 0 ? fmtD(budRev) : "—"}</td>
                <td className="px-4 py-2.5 text-right">{budRev > 0 ? <VarianceBadge {...variance(totalRev, budRev)} /> : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Expense table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Expense Breakdown</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium">Category</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Actual</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Budget</th>
                <th className="text-right px-4 py-2 text-muted-foreground font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No expense data</td></tr>
              ) : expenses.map(item => {
                const amt = fmtN(item.amount);
                const bud = fmtN(item.budget_amount);
                const v = varianceExpense(amt, bud);
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-foreground">{item.label}</td>
                    <td className="px-4 py-2.5 text-right font-medium" style={{ color: RED }}>{fmtD(amt)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{bud > 0 ? fmtD(bud) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">{bud > 0 ? <VarianceBadge {...v} /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/20">
                <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: RED }}>{fmtD(operatingExp)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">{budOperatingExp > 0 ? fmtD(budOperatingExp) : "—"}</td>
                <td className="px-4 py-2.5 text-right">{budOperatingExp > 0 ? <VarianceBadge {...varianceExpense(operatingExp, budOperatingExp)} /> : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Financials() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(now.getMonth() + 1);
  const [expandedSavedSummaries, setExpandedSavedSummaries] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();
  const tslug = impersonatingTenantSlug ?? undefined;
  const canImportPeriod = !!user && ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role) && !!impersonatingTenantSlug;
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string>("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedImportMonth, setSelectedImportMonth] = useState<number>(now.getMonth() + 1);
  const [selectedImportYear, setSelectedImportYear] = useState<number>(year || now.getFullYear());
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [isDispatchingAnalysis, setIsDispatchingAnalysis] = useState(false);
  const [isSavingReviewedPeriod, setIsSavingReviewedPeriod] = useState(false);
  const [uploadedFinancialPdfResult, setUploadedFinancialPdfResult] = useState<{
    documentId: string;
    fileKey: string;
    fileName: string;
    tenantSlug: string | null;
    selectedMonth: number;
    selectedYear: number;
  } | null>(null);
  const [analysisDispatchResult, setAnalysisDispatchResult] = useState<{
    importId: string;
    documentId: string;
    selectedMonth: number;
    selectedYear: number;
    status: "processing" | "ready_for_review" | "failed";
    fileName: string;
  } | null>(null);
  const [importFailureMessage, setImportFailureMessage] = useState<string | null>(null);
  const [reviewIncomeRows, setReviewIncomeRows] = useState<Array<{ localId: string; category: string; actual: string; budget: string }>>([]);
  const [reviewExpenseRows, setReviewExpenseRows] = useState<Array<{ localId: string; category: string; actual: string; budget: string }>>([]);
  const [reviewSpecialTotals, setReviewSpecialTotals] = useState<ReviewSpecialTotals>(defaultReviewSpecialTotals());
  const [cameronSummary, setCameronSummary] = useState("");
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiSuggestedSummary, setAiSuggestedSummary] = useState("");
  const [aiRevisionError, setAiRevisionError] = useState<string | null>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [historyViewVersion, setHistoryViewVersion] = useState<any | null>(null);
  const [historyRestoreVersion, setHistoryRestoreVersion] = useState<any | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [lastPersistedSummary, setLastPersistedSummary] = useState("");
  const [undoSummaryStack, setUndoSummaryStack] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [statusCheckError, setStatusCheckError] = useState<string | null>(null);
  const [statusPollingEnabled, setStatusPollingEnabled] = useState(true);
  const [initialReviewSnapshot, setInitialReviewSnapshot] = useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [confirmCloseMode, setConfirmCloseMode] = useState<"discard_review" | "cancel_import" | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reviewContentScrollRef = useRef<HTMLDivElement | null>(null);

  const validateAndSetPdfFile = (files: FileList | File[] | null | undefined) => {
    setUploadError("");
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setUploadError("Please select only one PDF file.");
      return;
    }

    const file = files[0];
    const isPdfType = file.type === "application/pdf";
    const isPdfName = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfType && !isPdfName) {
      setUploadError("Only PDF files are allowed.");
      return;
    }

    setSelectedPdfFile(file);
  };

  const clearSelectedPdfFile = () => {
    setSelectedPdfFile(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const trpcUtils = trpc.useUtils();
  const uploadMutation = trpc.documents.upload.useMutation();
  const analyzeUploadedPdfMutation = trpc.financials.analyzeUploadedPdf.useMutation();
  const saveReviewedPeriodMutation = trpc.financials.saveReviewedPeriod.useMutation();
  const rewriteSummaryWithAiMutation = trpc.financials.rewriteSummaryWithAi.useMutation();
  const createSummaryVersionMutation = trpc.financials.createSummaryVersion.useMutation();
  const restoreSummaryVersionMutation = trpc.financials.restoreSummaryVersion.useMutation();

  const summaryHistoryQuery = trpc.financials.getSummaryHistory.useQuery(
    { importId: analysisDispatchResult?.importId ?? "" },
    {
      enabled: !!analysisDispatchResult?.importId && analysisDispatchResult.status === "ready_for_review" && importDialogOpen && historyPanelOpen,
      refetchOnWindowFocus: false,
    },
  );
  const pollingEnabled = !!analysisDispatchResult?.importId && analysisDispatchResult.status === "processing" && importDialogOpen && statusPollingEnabled;

  const importStatusQuery = trpc.financials.getImportStatus.useQuery(
    { importId: analysisDispatchResult?.importId ?? "" },
    {
      enabled: pollingEnabled,
      refetchInterval: 2500,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );


  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
      reader.readAsDataURL(file);
    });

  const resetImportDialogState = () => {
    setSelectedPdfFile(null);
    setUploadError("");
    setIsDragActive(false);
    setSelectedImportMonth(now.getMonth() + 1);
    setSelectedImportYear(year || now.getFullYear());
    setUploadedFinancialPdfResult(null);
    setAnalysisDispatchResult(null);
    setImportFailureMessage(null);
    setReviewIncomeRows([]);
    setReviewExpenseRows([]);
    setReviewSpecialTotals(defaultReviewSpecialTotals());
    setCameronSummary("");
    setAiAssistOpen(false);
    setAiInstruction("");
    setAiSuggestedSummary("");
    setAiRevisionError(null);
    setHistoryPanelOpen(false);
    setHistoryViewVersion(null);
    setHistoryRestoreVersion(null);
    setHistoryWarning(null);
    setLastPersistedSummary("");
    setUndoSummaryStack([]);
    setReviewNotes("");
    setInitialReviewSnapshot(null);
    setStatusCheckError(null);
    setStatusPollingEnabled(true);
    setIsUploadingImport(false);
    setIsDispatchingAnalysis(false);
    setIsSavingReviewedPeriod(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const requestCloseImportDialog = () => {
    const isActiveBusy = isUploadingImport || isDispatchingAnalysis || isSavingReviewedPeriod || analysisDispatchResult?.status === "processing";
    if (isActiveBusy) {
      setConfirmCloseMode("cancel_import");
      setConfirmCloseOpen(true);
      return;
    }
    if (analysisDispatchResult?.status === "ready_for_review" && hasUnsavedReviewChanges) {
      setConfirmCloseMode("discard_review");
      setConfirmCloseOpen(true);
      return;
    }
    if (analysisDispatchResult?.status === "ready_for_review" || hasInProgressImport) {
      setConfirmCloseMode("cancel_import");
      setConfirmCloseOpen(true);
      return;
    }
    setImportDialogOpen(false);
    resetImportDialogState();
  };

  const handleDiscardAndClose = () => {
    setConfirmCloseOpen(false);
    setConfirmCloseMode(null);
    setImportDialogOpen(false);
    resetImportDialogState();
  };

  const startAnalysisDispatch = async (args: { documentId: string; month: number; year: number; tenantSlug: string; fileName: string }) => {
    setIsDispatchingAnalysis(true);
    try {
      const analysis = await analyzeUploadedPdfMutation.mutateAsync({
        documentId: args.documentId,
        month: Number(args.month),
        year: Number(args.year),
        tenantSlug: args.tenantSlug,
      });


      if (!analysis?.success || !analysis?.importId || analysis?.status !== "processing") {
        throw new Error("Analysis dispatch did not return a valid processing response.");
      }

      const nextDispatch = {
        importId: String(analysis.importId),
        documentId: String(analysis.documentId),
        selectedMonth: Number(args.month),
        selectedYear: Number(args.year),
        status: "processing" as const,
        fileName: args.fileName,
      };
      setAnalysisDispatchResult(nextDispatch);

      setImportFailureMessage(null);
      setStatusCheckError(null);
      setStatusPollingEnabled(true);

      toast.success("Financial PDF uploaded and sent for analysis.");
    } catch {
      setImportFailureMessage("The PDF was uploaded, but analysis could not be started. Please try again.");
      toast.error("The PDF was uploaded, but analysis could not be started. Please try again.");
    } finally {
      setIsDispatchingAnalysis(false);
    }
  };

  const handleAnalyzePlaceholder = async () => {
    if (isUploadingImport || isDispatchingAnalysis) return;
    if (!selectedPdfFile || !selectedImportMonth || !selectedImportYear) return;

    const isStaffImportRole = !!user && ["admin", "accounting_manager", "tax_manager", "accountant"].includes(user.role);
    if (!isStaffImportRole) {
      toast.error("You do not have permission to import financial PDFs.");
      return;
    }

    if (!impersonatingTenantSlug) {
      toast.error("Please select a client workspace before importing financial data.");
      return;
    }

    setIsUploadingImport(true);
    try {
      const base64 = await fileToBase64(selectedPdfFile);
      const result = await uploadMutation.mutateAsync({
        name: selectedPdfFile.name.replace(/\.[^.]+$/, "") || selectedPdfFile.name,
        fileBase64: base64,
        mimeType: "application/pdf",
        fileName: selectedPdfFile.name,
        fileSize: selectedPdfFile.size,
        docType: "Financials",
        year: Number(selectedImportYear),
        month: Number(selectedImportMonth),
        tenantSlug: impersonatingTenantSlug,
      });

      const documentId = result && typeof (result as any).documentId === "string"
        ? String((result as any).documentId)
        : "";
      const fileKey = result && typeof (result as any).fileKey === "string"
        ? String((result as any).fileKey)
        : "";
      const fileName = result && typeof (result as any).fileName === "string"
        ? String((result as any).fileName)
        : selectedPdfFile.name;
      const tenantSlug = result && typeof (result as any).tenantSlug === "string"
        ? String((result as any).tenantSlug)
        : impersonatingTenantSlug;

      if (!documentId || !fileKey) {
        throw new Error("Upload completed but required file metadata was not returned.");
      }

      setUploadedFinancialPdfResult({
        documentId,
        fileKey,
        fileName,
        tenantSlug,
        selectedMonth: Number(selectedImportMonth),
        selectedYear: Number(selectedImportYear),
      });

      await startAnalysisDispatch({
        documentId,
        month: Number(selectedImportMonth),
        year: Number(selectedImportYear),
        tenantSlug: impersonatingTenantSlug,
        fileName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload financial PDF.";
      toast.error(message || "Failed to upload financial PDF.");
    } finally {
      setIsUploadingImport(false);
    }
  };

  const makeLocalRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const sanitizeNumericInput = (value: string): string => {
    const raw = value.trim();
    if (raw === "") return "";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return "";
    return String(parsed);
  };

  const persistSummaryVersion = async (args: {
    summary: string;
    changeSource: "manual_edit" | "ai_revision" | "restored_version" | "final_approved";
    restoredFromVersionId?: string;
  }) => {
    if (!analysisDispatchResult?.importId) return null;
    const summaryTrimmed = args.summary.trim();
    if (!summaryTrimmed) return null;
    const latestPersisted = lastPersistedSummary.trim();
    if (latestPersisted === summaryTrimmed && args.changeSource !== "final_approved") {
      return null;
    }
    const created = await createSummaryVersionMutation.mutateAsync({
      importId: analysisDispatchResult.importId,
      summary: summaryTrimmed,
      changeSource: args.changeSource,
      restoredFromVersionId: args.restoredFromVersionId,
    });
    setLastPersistedSummary(summaryTrimmed);
    void summaryHistoryQuery.refetch();
    return created;
  };

  const handleSummaryBlurSnapshot = async () => {
    if (analysisDispatchResult?.status !== "ready_for_review") return;
    if (rewriteSummaryWithAiMutation.isPending || createSummaryVersionMutation.isPending) return;
    try {
      await persistSummaryVersion({ summary: cameronSummary, changeSource: "manual_edit" });
      setHistoryWarning(null);
    } catch {
      setHistoryWarning("Could not save this edit to summary history yet.");
    }
  };

  const handleGenerateAiRevision = async () => {
    if (!analysisDispatchResult?.importId) {
      toast.error("Unable to generate revision right now.");
      return;
    }

    const instruction = aiInstruction.trim();
    if (!instruction) {
      setAiRevisionError("Please add an instruction for AI Assist.");
      return;
    }

    setAiRevisionError(null);
    try {
      const result = await rewriteSummaryWithAiMutation.mutateAsync({
        importId: analysisDispatchResult.importId,
        instruction,
        currentSummary: cameronSummary,
        incomeSources: reviewIncomeRows.map((r) => ({
          id: r.localId,
          category: r.category,
          actual: Number.isFinite(Number(r.actual)) ? Number(r.actual) : 0,
          budget: r.budget === "" ? null : Number.isFinite(Number(r.budget)) ? Number(r.budget) : null,
        })),
        expenses: reviewExpenseRows.map((r) => ({
          id: r.localId,
          category: r.category,
          actual: Number.isFinite(Number(r.actual)) ? Number(r.actual) : 0,
          budget: r.budget === "" ? null : Number.isFinite(Number(r.budget)) ? Number(r.budget) : null,
        })),
        specialTotals: {
          totalCostOfGoodsSold: {
            actual: Number.isFinite(Number(reviewSpecialTotals.totalCostOfGoodsSold.actual)) ? Number(reviewSpecialTotals.totalCostOfGoodsSold.actual) : 0,
            budget: reviewSpecialTotals.totalCostOfGoodsSold.budget === "" ? null : (Number.isFinite(Number(reviewSpecialTotals.totalCostOfGoodsSold.budget)) ? Number(reviewSpecialTotals.totalCostOfGoodsSold.budget) : null),
          },
          totalOtherIncome: {
            actual: Number.isFinite(Number(reviewSpecialTotals.totalOtherIncome.actual)) ? Number(reviewSpecialTotals.totalOtherIncome.actual) : 0,
            budget: reviewSpecialTotals.totalOtherIncome.budget === "" ? null : (Number.isFinite(Number(reviewSpecialTotals.totalOtherIncome.budget)) ? Number(reviewSpecialTotals.totalOtherIncome.budget) : null),
          },
          totalOtherExpense: {
            actual: Number.isFinite(Number(reviewSpecialTotals.totalOtherExpense.actual)) ? Number(reviewSpecialTotals.totalOtherExpense.actual) : 0,
            budget: reviewSpecialTotals.totalOtherExpense.budget === "" ? null : (Number.isFinite(Number(reviewSpecialTotals.totalOtherExpense.budget)) ? Number(reviewSpecialTotals.totalOtherExpense.budget) : null),
          },
        },
      });

      setAiSuggestedSummary(result.revisedSummary);
      setAiRevisionError(null);
    } catch {
      setAiRevisionError("We couldn’t generate a revised summary. Your current summary has not been changed.");
      toast.error("We couldn’t generate a revised summary. Your current summary has not been changed.");
    }
  };

  const handleRestoreSummaryVersion = async () => {
    if (!analysisDispatchResult?.importId || !historyRestoreVersion?.id) return;
    try {
      const restored = await restoreSummaryVersionMutation.mutateAsync({
        importId: analysisDispatchResult.importId,
        versionId: historyRestoreVersion.id,
      });
      setUndoSummaryStack((prev) => [...prev, cameronSummary]);
      setCameronSummary(restored.restoredSummary);
      setLastPersistedSummary(restored.restoredSummary.trim());
      setHistoryRestoreVersion(null);
      setHistoryWarning(null);
      void summaryHistoryQuery.refetch();
    } catch {
      setHistoryWarning("Unable to restore this version right now.");
    }
  };

  const handleSaveReviewedPeriod = async () => {
    if (!analysisDispatchResult?.importId) return;
    if (!impersonatingTenantSlug) {
      toast.error("Please select a client workspace before saving financial data.");
      return;
    }
    if (analysisDispatchResult.status !== "ready_for_review") {
      toast.error("Financial analysis is not ready for saving yet.");
      return;
    }


    const normalizedIncome = reviewIncomeRows.map((row) => ({
      category: row.category.trim(),
      actual: row.actual === "" ? NaN : Number(row.actual),
      budget: row.budget === "" ? null : Number(row.budget),
    }));
    const normalizedExpenses = reviewExpenseRows.map((row) => ({
      category: row.category.trim(),
      actual: row.actual === "" ? NaN : Number(row.actual),
      budget: row.budget === "" ? null : Number(row.budget),
    }));

    const badCategory = [...normalizedIncome, ...normalizedExpenses].some((r) => !r.category);
    if (badCategory) {
      toast.error("Each row must have a category.");
      return;
    }

    const badNumbers = [...normalizedIncome, ...normalizedExpenses].some(
      (r) => !Number.isFinite(r.actual) || (r.budget != null && !Number.isFinite(r.budget)),
    );
    if (badNumbers) {
      toast.error("Actual and budget values must be valid numbers.");
      return;
    }

    setIsSavingReviewedPeriod(true);
    try {
      const specialTotalsPayload = {
        totalCostOfGoodsSold: {
          actual: Number.isFinite(Number(reviewSpecialTotals.totalCostOfGoodsSold.actual)) ? Number(reviewSpecialTotals.totalCostOfGoodsSold.actual) : 0,
          budget: reviewSpecialTotals.totalCostOfGoodsSold.budget === "" ? null : (Number.isFinite(Number(reviewSpecialTotals.totalCostOfGoodsSold.budget)) ? Number(reviewSpecialTotals.totalCostOfGoodsSold.budget) : null),
        },
        totalOtherIncome: {
          actual: Number.isFinite(Number(reviewSpecialTotals.totalOtherIncome.actual)) ? Number(reviewSpecialTotals.totalOtherIncome.actual) : 0,
          budget: reviewSpecialTotals.totalOtherIncome.budget === "" ? null : (Number.isFinite(Number(reviewSpecialTotals.totalOtherIncome.budget)) ? Number(reviewSpecialTotals.totalOtherIncome.budget) : null),
        },
        totalOtherExpense: {
          actual: Number.isFinite(Number(reviewSpecialTotals.totalOtherExpense.actual)) ? Number(reviewSpecialTotals.totalOtherExpense.actual) : 0,
          budget: reviewSpecialTotals.totalOtherExpense.budget === "" ? null : (Number.isFinite(Number(reviewSpecialTotals.totalOtherExpense.budget)) ? Number(reviewSpecialTotals.totalOtherExpense.budget) : null),
        },
      };

      const result = await saveReviewedPeriodMutation.mutateAsync({
        importId: analysisDispatchResult.importId,
        tenantSlug: impersonatingTenantSlug,
        month: analysisDispatchResult.selectedMonth,
        year: analysisDispatchResult.selectedYear,
        incomeSources: normalizedIncome,
        expenses: normalizedExpenses,
        specialTotals: specialTotalsPayload,
        financialSummary: cameronSummary,
        notes: reviewNotes,
      });

      if (!result?.success) {
        throw new Error("Save did not complete successfully.");
      }

      toast.success("Financial period saved successfully.");
      await Promise.all([
        trpcUtils.financials.get.invalidate({ year, tenantSlug: tslug }),
        trpcUtils.financials.lineItemsByYear.invalidate({ year, tenantSlug: tslug }),
      ]);

      setImportDialogOpen(false);
      resetImportDialogState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save financial period.";
      toast.error(message || "Failed to save financial period.");
    } finally {
      setIsSavingReviewedPeriod(false);
    }
  };

  useEffect(() => {
    if (!importDialogOpen || !analysisDispatchResult?.importId || analysisDispatchResult.status !== "processing") return;


    if (importStatusQuery.error) {
      setStatusCheckError("We couldn’t retrieve the financial analysis status. Please try again.");
      setStatusPollingEnabled(false);
      return;
    }

    const latest = importStatusQuery.data;
    if (!latest) return;

    if (latest.status === "failed") {
      setAnalysisDispatchResult((prev) => prev ? { ...prev, status: "failed" } : prev);
      setImportFailureMessage(latest.errorMessage || "Financial analysis failed.");
      setStatusCheckError(null);
      return;
    }

    if (latest.status === "ready_for_review") {
      if (reviewContentScrollRef.current) {
        reviewContentScrollRef.current.scrollTop = 0;
      }
      const extracted = (latest.extractedData || {}) as any;
      const incomeSources = Array.isArray(extracted.incomeSources) ? extracted.incomeSources : [];
      const expenses = Array.isArray(extracted.expenses) ? extracted.expenses : [];
      const specialTotals = extracted?.specialTotals && typeof extracted.specialTotals === "object"
        ? extracted.specialTotals
        : {
            totalCostOfGoodsSold: { actual: 0, budget: null },
            totalOtherIncome: { actual: 0, budget: null },
            totalOtherExpense: { actual: 0, budget: null },
          };
      const financialSummary = typeof extracted.financialSummary === "string" ? extracted.financialSummary : "";
      const notes = typeof extracted.notes === "string" ? extracted.notes : "";

      setReviewIncomeRows(
        incomeSources.map((row: any) => ({
          localId: makeLocalRowId(),
          category: typeof row?.category === "string" ? row.category : "",
          actual: row?.actual == null ? "" : String(row.actual),
          budget: row?.budget == null ? "" : String(row.budget),
        })),
      );

      setReviewExpenseRows(
        expenses.map((row: any) => ({
          localId: makeLocalRowId(),
          category: typeof row?.category === "string" ? row.category : "",
          actual: row?.actual == null ? "" : String(row.actual),
          budget: row?.budget == null ? "" : String(row.budget),
        })),
      );

      setReviewSpecialTotals({
        totalCostOfGoodsSold: {
          actual: specialTotals?.totalCostOfGoodsSold?.actual == null ? "0" : String(specialTotals.totalCostOfGoodsSold.actual),
          budget: specialTotals?.totalCostOfGoodsSold?.budget == null ? "" : String(specialTotals.totalCostOfGoodsSold.budget),
        },
        totalOtherIncome: {
          actual: specialTotals?.totalOtherIncome?.actual == null ? "0" : String(specialTotals.totalOtherIncome.actual),
          budget: specialTotals?.totalOtherIncome?.budget == null ? "" : String(specialTotals.totalOtherIncome.budget),
        },
        totalOtherExpense: {
          actual: specialTotals?.totalOtherExpense?.actual == null ? "0" : String(specialTotals.totalOtherExpense.actual),
          budget: specialTotals?.totalOtherExpense?.budget == null ? "" : String(specialTotals.totalOtherExpense.budget),
        },
      });
      setCameronSummary(financialSummary);
      setAiAssistOpen(false);
      setAiInstruction("");
      setAiSuggestedSummary("");
      setAiRevisionError(null);
      setHistoryPanelOpen(false);
      setHistoryViewVersion(null);
      setHistoryRestoreVersion(null);
      setHistoryWarning(null);
      setLastPersistedSummary(financialSummary.trim());
      setUndoSummaryStack([]);
      setReviewNotes(notes);
      setInitialReviewSnapshot(
        JSON.stringify({
          income: incomeSources.map((row: any) => ({
            category: typeof row?.category === "string" ? row.category : "",
            actual: row?.actual == null ? "" : String(row.actual),
            budget: row?.budget == null ? "" : String(row.budget),
          })),
          expense: expenses.map((row: any) => ({
            category: typeof row?.category === "string" ? row.category : "",
            actual: row?.actual == null ? "" : String(row.actual),
            budget: row?.budget == null ? "" : String(row.budget),
          })),
          specialTotals: {
            totalCostOfGoodsSold: {
              actual: specialTotals?.totalCostOfGoodsSold?.actual == null ? "0" : String(specialTotals.totalCostOfGoodsSold.actual),
              budget: specialTotals?.totalCostOfGoodsSold?.budget == null ? "" : String(specialTotals.totalCostOfGoodsSold.budget),
            },
            totalOtherIncome: {
              actual: specialTotals?.totalOtherIncome?.actual == null ? "0" : String(specialTotals.totalOtherIncome.actual),
              budget: specialTotals?.totalOtherIncome?.budget == null ? "" : String(specialTotals.totalOtherIncome.budget),
            },
            totalOtherExpense: {
              actual: specialTotals?.totalOtherExpense?.actual == null ? "0" : String(specialTotals.totalOtherExpense.actual),
              budget: specialTotals?.totalOtherExpense?.budget == null ? "" : String(specialTotals.totalOtherExpense.budget),
            },
          },
          cameronSummary: financialSummary,
          reviewNotes: notes,
        }),
      );
      setAnalysisDispatchResult((prev) => prev ? { ...prev, status: "ready_for_review" } : prev);
      setImportFailureMessage(null);
      setStatusCheckError(null);
      setStatusPollingEnabled(false);
    }
  }, [
    importDialogOpen,
    analysisDispatchResult?.importId,
    analysisDispatchResult?.status,
    importStatusQuery.data,
    importStatusQuery.error,
  ]);

  const reviewRevenue = useMemo(
    () => reviewIncomeRows.reduce((sum, row) => sum + (Number.isFinite(Number(row.actual)) ? Number(row.actual) : 0), 0),
    [reviewIncomeRows],
  );
  const reviewOperatingExpenses = useMemo(
    () => reviewExpenseRows.reduce((sum, row) => sum + (Number.isFinite(Number(row.actual)) ? Number(row.actual) : 0), 0),
    [reviewExpenseRows],
  );
  const reviewBudgetRevenue = useMemo(
    () => reviewIncomeRows.reduce((sum, row) => sum + (Number.isFinite(Number(row.budget)) ? Number(row.budget) : 0), 0),
    [reviewIncomeRows],
  );
  const reviewBudgetOperatingExpenses = useMemo(
    () => reviewExpenseRows.reduce((sum, row) => sum + (Number.isFinite(Number(row.budget)) ? Number(row.budget) : 0), 0),
    [reviewExpenseRows],
  );

  const specialCogsActual = Number.isFinite(Number(reviewSpecialTotals.totalCostOfGoodsSold.actual))
    ? Number(reviewSpecialTotals.totalCostOfGoodsSold.actual)
    : 0;
  const specialCogsBudgetForCalc = Number.isFinite(Number(reviewSpecialTotals.totalCostOfGoodsSold.budget))
    ? Number(reviewSpecialTotals.totalCostOfGoodsSold.budget)
    : 0;
  const specialOtherIncomeActual = Number.isFinite(Number(reviewSpecialTotals.totalOtherIncome.actual))
    ? Number(reviewSpecialTotals.totalOtherIncome.actual)
    : 0;
  const specialOtherIncomeBudgetForCalc = Number.isFinite(Number(reviewSpecialTotals.totalOtherIncome.budget))
    ? Number(reviewSpecialTotals.totalOtherIncome.budget)
    : 0;
  const specialOtherExpenseActual = Number.isFinite(Number(reviewSpecialTotals.totalOtherExpense.actual))
    ? Number(reviewSpecialTotals.totalOtherExpense.actual)
    : 0;
  const specialOtherExpenseBudgetForCalc = Number.isFinite(Number(reviewSpecialTotals.totalOtherExpense.budget))
    ? Number(reviewSpecialTotals.totalOtherExpense.budget)
    : 0;

  const reviewGrossProfit = reviewRevenue - specialCogsActual;
  const reviewNetProfit = reviewRevenue - specialCogsActual - reviewOperatingExpenses + specialOtherIncomeActual - specialOtherExpenseActual;
  const reviewMargin = reviewRevenue > 0 ? (reviewNetProfit / reviewRevenue) * 100 : 0;

  const reviewBudgetGrossProfit = reviewBudgetRevenue - specialCogsBudgetForCalc;
  const reviewBudgetNetProfit = reviewBudgetRevenue - specialCogsBudgetForCalc - reviewBudgetOperatingExpenses + specialOtherIncomeBudgetForCalc - specialOtherExpenseBudgetForCalc;
  const reviewBudgetMargin = reviewBudgetRevenue > 0 ? (reviewBudgetNetProfit / reviewBudgetRevenue) * 100 : 0;

  const currentReviewSnapshot = useMemo(
    () => JSON.stringify({ income: reviewIncomeRows, expense: reviewExpenseRows, specialTotals: reviewSpecialTotals, cameronSummary, reviewNotes }),
    [reviewIncomeRows, reviewExpenseRows, reviewSpecialTotals, cameronSummary, reviewNotes],
  );
  const hasUnsavedReviewChanges =
    analysisDispatchResult?.status === "ready_for_review" &&
    initialReviewSnapshot != null &&
    currentReviewSnapshot !== initialReviewSnapshot;

  const hasInProgressImport =
    !!selectedPdfFile ||
    !!uploadedFinancialPdfResult ||
    !!analysisDispatchResult ||
    !!uploadError ||
    isUploadingImport ||
    isDispatchingAnalysis ||
    isSavingReviewedPeriod;

  const { data: financials = [], isLoading } = trpc.financials.get.useQuery({ year, tenantSlug: tslug });
  const { data: lineItems = [] } = trpc.financials.lineItems.useQuery(
    { year, month: expandedMonth ?? now.getMonth() + 1, tenantSlug: tslug },
    { enabled: expandedMonth != null }
  );

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  // Periods sorted newest first
  const periods = useMemo(() => [...financials].sort((a, b) => b.month - a.month), [financials]);

  const expandedPeriod = expandedMonth != null ? financials.find(f => f.month === expandedMonth) : null;
  const isReviewState = analysisDispatchResult?.status === "ready_for_review";

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Financials</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Year: {year}</p>
          </div>
          <div className="flex items-center gap-2">
            {canImportPeriod && (
              <button
                type="button"
                onClick={() => {
                  resetImportDialogState();
                  setImportDialogOpen(true);
                }}
                className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 hover:bg-muted/20 transition-colors"
              >
                Import Period
              </button>
            )}
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Period History — collapsible rows */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Period History</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}
            </div>
          ) : periods.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              No financial data for {year}.
            </div>
          ) : (
            <div className="space-y-2">
              {periods.map((period: any) => (
                <div key={period.month}>
                  <PeriodRow
                    period={{
                      year: period.year,
                      month: period.month,
                      revenue: fmtN(period.revenue),
                      expenses: fmtN(period.expenses),
                      cogs_actual: fmtN((period as any).cogs_actual),
                      cogs_budget: (period as any).cogs_budget == null ? null : fmtN((period as any).cogs_budget),
                      other_income_actual: fmtN((period as any).other_income_actual),
                      other_income_budget: (period as any).other_income_budget == null ? null : fmtN((period as any).other_income_budget),
                      other_expense_actual: fmtN((period as any).other_expense_actual),
                      other_expense_budget: (period as any).other_expense_budget == null ? null : fmtN((period as any).other_expense_budget),
                      net_profit: fmtN(period.net_profit),
                      net_profit_margin: fmtN(period.net_profit_margin),
                      budget_revenue: fmtN(period.budget_revenue),
                      budget_expenses: fmtN(period.budget_expenses),
                      summary: period.summary,
                    }}
                    isExpanded={expandedMonth === period.month}
                    onExpand={() => setExpandedMonth(expandedMonth === period.month ? null : period.month)}
                  />
                  {expandedMonth === period.month && expandedPeriod && (
                    <ExpandedPeriodDetail
                      period={{
                        id: expandedPeriod.id,
                        year: expandedPeriod.year,
                        month: expandedPeriod.month,
                        revenue: fmtN(expandedPeriod.revenue),
                        expenses: fmtN(expandedPeriod.expenses),
                        cogs_actual: fmtN((expandedPeriod as any).cogs_actual),
                        cogs_budget: (expandedPeriod as any).cogs_budget == null ? null : fmtN((expandedPeriod as any).cogs_budget),
                        other_income_actual: fmtN((expandedPeriod as any).other_income_actual),
                        other_income_budget: (expandedPeriod as any).other_income_budget == null ? null : fmtN((expandedPeriod as any).other_income_budget),
                        other_expense_actual: fmtN((expandedPeriod as any).other_expense_actual),
                        other_expense_budget: (expandedPeriod as any).other_expense_budget == null ? null : fmtN((expandedPeriod as any).other_expense_budget),
                        net_profit: fmtN(expandedPeriod.net_profit),
                        net_profit_margin: fmtN(expandedPeriod.net_profit_margin),
                        budget_revenue: fmtN(expandedPeriod.budget_revenue),
                        budget_expenses: fmtN(expandedPeriod.budget_expenses),
                        summary: expandedPeriod.summary,
                      }}
                      summaryExpanded={!!expandedSavedSummaries[String(expandedPeriod.id ?? `${expandedPeriod.year}-${expandedPeriod.month}`)]}
                      onToggleSummaryExpanded={() => {
                        const key = String(expandedPeriod.id ?? `${expandedPeriod.year}-${expandedPeriod.month}`);
                        setExpandedSavedSummaries((prev) => ({ ...prev, [key]: !prev[key] }));
                      }}
                      lineItems={lineItems.map(li => ({
                        id: li.id,
                        label: li.label,
                        type: li.type,
                        amount: fmtN(li.amount),
                        budget_amount: li.budget_amount != null ? fmtN(li.budget_amount) : null,
                      }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <Dialog
          open={importDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              requestCloseImportDialog();
              return;
            }
            setImportDialogOpen(true);
          }}
        >
          <DialogContent
            className={[
              "bg-card border-border w-[95vw] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden p-0 flex flex-col",
              isReviewState ? "sm:max-w-[1480px]" : "sm:max-w-[760px]",
            ].join(" ")}
            showCloseButton={false}
            onEscapeKeyDown={(e) => {
              e.preventDefault();
              requestCloseImportDialog();
            }}
            onPointerDownOutside={(e) => {
              e.preventDefault();
            }}
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
          >
            <div className="sticky top-0 z-10 border-b border-border/80 bg-card/95 backdrop-blur px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <DialogTitle>Review Financial Data</DialogTitle>
                <DialogDescription className="mt-1">
                  {analysisDispatchResult
                    ? `${MONTHS_LONG[Math.max(0, analysisDispatchResult.selectedMonth - 1)]} ${analysisDispatchResult.selectedYear} • Uploaded PDF analysis`
                    : "Upload a monthly financial PDF. The file will be analyzed to extract income sources and expenses."}
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={requestCloseImportDialog}
                aria-label="Close import dialog"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div ref={reviewContentScrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {analysisDispatchResult?.status === "processing" && statusCheckError ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                  <h3 className="text-sm font-semibold text-yellow-200 mb-1">Unable to check analysis status</h3>
                  <p className="text-sm text-yellow-100">We couldn’t retrieve the financial analysis status. Please try again.</p>
                </div>
              </div>
            ) : analysisDispatchResult?.status === "processing" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-1">Analyzing financial data</h3>
                  <p className="text-sm text-muted-foreground">
                    We’re extracting income sources and expenses from {analysisDispatchResult.fileName}. This may take a moment.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                  <p className="text-sm text-foreground">Selected period: {MONTHS_LONG[Math.max(0, analysisDispatchResult.selectedMonth - 1)]} {analysisDispatchResult.selectedYear}</p>
                  <p className="text-sm text-foreground">File: {analysisDispatchResult.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Processing…
                  </div>
                </div>
              </div>
            ) : analysisDispatchResult?.status === "ready_for_review" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-base font-semibold text-primary mt-1">{fmtD(reviewRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">COGS</p>
                    <p className="text-base font-semibold text-red-300 mt-1">{fmtD(specialCogsActual)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Operating Expenses</p>
                    <p className="text-base font-semibold text-red-300 mt-1">{fmtD(reviewOperatingExpenses)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Net Profit</p>
                    <p className="text-base font-semibold text-emerald-300 mt-1">{fmtD(reviewNetProfit)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Net Margin</p>
                    <p className="text-base font-semibold text-foreground mt-1">{reviewMargin.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="rounded-lg border border-primary/30 p-4 space-y-3 bg-primary/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">Cameron’s Financial Summary</h4>
                      <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">Draft</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {undoSummaryStack.length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const prev = undoSummaryStack[undoSummaryStack.length - 1];
                            setUndoSummaryStack((stack) => stack.slice(0, -1));
                            setCameronSummary(prev);
                          }}
                        >
                          Undo
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setHistoryPanelOpen((v) => !v);
                          setAiAssistOpen(false);
                        }}
                      >
                        <History className="w-4 h-4 mr-1" />
                        History
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAiAssistOpen((v) => !v);
                          setHistoryPanelOpen(false);
                        }}
                        disabled={rewriteSummaryWithAiMutation.isPending}
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        AI Assist
                      </Button>
                    </div>
                  </div>

                  {aiAssistOpen && (
                    <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-2">
                      <label className="text-xs font-medium text-foreground">Tell AI what to improve</label>
                      <Textarea
                        value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        maxLength={2000}
                        className="w-full min-h-[96px] bg-muted/35 border-border/60"
                        placeholder="Example: Make this easier for the client to understand and clarify that payroll remained within budget."
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>AI will rewrite only Cameron’s Financial Summary. Financial figures and rows will not be changed.</span>
                        <span>{aiInstruction.length.toLocaleString()} / 2,000</span>
                      </div>
                      {aiRevisionError && <p className="text-xs text-red-300">{aiRevisionError}</p>}
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setAiAssistOpen(false);
                            setAiInstruction("");
                            setAiSuggestedSummary("");
                            setAiRevisionError(null);
                          }}
                          disabled={rewriteSummaryWithAiMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button type="button" onClick={handleGenerateAiRevision} disabled={rewriteSummaryWithAiMutation.isPending}>
                          {rewriteSummaryWithAiMutation.isPending ? "Generating Revision..." : "Generate Revision"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {aiSuggestedSummary && (
                    <div className="rounded-md border border-primary/25 bg-primary/10 p-3 space-y-2">
                      <h5 className="text-xs font-semibold text-primary">AI Suggested Revision</h5>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{aiSuggestedSummary}</p>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setAiSuggestedSummary("");
                            setAiRevisionError(null);
                          }}
                          disabled={rewriteSummaryWithAiMutation.isPending}
                        >
                          Keep Current Summary
                        </Button>
                        <Button
                          type="button"
                          onClick={async () => {
                            try {
                              await persistSummaryVersion({ summary: aiSuggestedSummary, changeSource: "ai_revision" });
                            } catch {
                              setAiRevisionError("We couldn’t store this revision in history yet. Please try again.");
                              return;
                            }
                            setUndoSummaryStack((prev) => [...prev, cameronSummary]);
                            setCameronSummary(aiSuggestedSummary);
                            setAiSuggestedSummary("");
                            setAiInstruction("");
                            setAiRevisionError(null);
                            setAiAssistOpen(false);
                          }}
                          disabled={rewriteSummaryWithAiMutation.isPending || createSummaryVersionMutation.isPending}
                        >
                          Apply Revision
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className={historyPanelOpen ? "grid grid-cols-1 lg:grid-cols-12 gap-3" : "space-y-2"}>
                    <div className={historyPanelOpen ? "lg:col-span-7 space-y-2" : "space-y-2"}>
                      <p className="text-xs text-muted-foreground">Review and edit this summary before saving.</p>
                      <Textarea
                        value={cameronSummary}
                        onChange={(e) => setCameronSummary(e.target.value)}
                        onBlur={handleSummaryBlurSnapshot}
                        maxLength={10000}
                        className="w-full min-h-[160px] bg-muted/30 border-border/70"
                        placeholder="Cameron's financial summary"
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>This summary will be visible in the saved financial period after approval.</span>
                        <span>{cameronSummary.length.toLocaleString()} / 10,000</span>
                      </div>
                      {historyWarning && <p className="text-xs text-amber-300">{historyWarning}</p>}
                    </div>

                    {historyPanelOpen && (
                      <div className="lg:col-span-5 rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-semibold text-foreground">Summary History</h5>
                          <Button type="button" size="sm" variant="ghost" onClick={() => void summaryHistoryQuery.refetch()}>
                            Retry
                          </Button>
                        </div>

                        {summaryHistoryQuery.isLoading ? (
                          <p className="text-sm text-muted-foreground">Loading history…</p>
                        ) : summaryHistoryQuery.isError ? (
                          <p className="text-sm text-red-300">Unable to load summary history.</p>
                        ) : (summaryHistoryQuery.data?.versions?.length ?? 0) === 0 ? (
                          <p className="text-sm text-muted-foreground">No versions yet.</p>
                        ) : (
                          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                            {(summaryHistoryQuery.data?.versions ?? []).map((v) => {
                              const sourceLabel = v.changeSource === "initial_extraction"
                                ? "Original Extraction"
                                : v.changeSource === "manual_edit"
                                  ? "Manual Edit"
                                  : v.changeSource === "ai_revision"
                                    ? "AI Revision"
                                    : v.changeSource === "restored_version"
                                      ? "Restored Version"
                                      : "Final Approved";
                              const isCurrent = v.summary.trim() === cameronSummary.trim();
                              return (
                                <div key={v.id} className="rounded-md border border-border/60 bg-card/40 p-2 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs text-foreground font-medium">Version {v.versionNumber}</div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">{sourceLabel}</span>
                                      {isCurrent && <span className="text-[10px] rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">Current</span>}
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {new Date(v.createdAt).toLocaleString()} • {v.changeSource === "initial_extraction"
                                      ? "Created by System"
                                      : v.changeSource === "ai_revision"
                                        ? "Generated by AI"
                                        : v.createdByRole
                                          ? `Updated by ${v.createdByRole}`
                                          : "Created by System"}
                                  </p>
                                  <p className="text-xs text-foreground/85 line-clamp-3 whitespace-pre-wrap break-words">{v.summary}</p>
                                  <div className="flex items-center justify-end gap-2">
                                    <Button type="button" size="sm" variant="outline" onClick={() => setHistoryViewVersion(v)}>View</Button>
                                    <Button type="button" size="sm" onClick={() => setHistoryRestoreVersion(v)} disabled={restoreSummaryVersionMutation.isPending}>Restore this version</Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Special Totals</h4>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground/90 px-1">
                    <div className="col-span-12 sm:col-span-6">Category</div>
                    <div className="col-span-6 sm:col-span-3 text-right">Actual</div>
                    <div className="col-span-6 sm:col-span-3 text-right">Budget</div>
                  </div>

                  {[
                    { key: "totalCostOfGoodsSold", label: "Cost of Goods Sold" },
                    { key: "totalOtherIncome", label: "Other Income" },
                    { key: "totalOtherExpense", label: "Other Expense" },
                  ].map((item) => (
                    <div key={item.key} className="grid grid-cols-12 gap-2 items-center border border-border/50 rounded-md p-2 bg-card/40">
                      <div className="col-span-12 sm:col-span-6 text-sm text-foreground">{item.label}</div>
                      <div className="col-span-6 sm:col-span-3 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <Input
                          className="pl-5 text-right bg-muted/35 border-border/60"
                          inputMode="decimal"
                          placeholder="0"
                          value={(reviewSpecialTotals as any)[item.key].actual}
                          onChange={(e) => setReviewSpecialTotals((prev) => ({
                            ...prev,
                            [item.key]: {
                              ...(prev as any)[item.key],
                              actual: sanitizeNumericInput(e.target.value),
                            },
                          }))}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <Input
                          className="pl-5 text-right bg-muted/35 border-border/60"
                          inputMode="decimal"
                          placeholder=""
                          value={(reviewSpecialTotals as any)[item.key].budget}
                          onChange={(e) => setReviewSpecialTotals((prev) => ({
                            ...prev,
                            [item.key]: {
                              ...(prev as any)[item.key],
                              budget: sanitizeNumericInput(e.target.value),
                            },
                          }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Income Sources</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewIncomeRows((prev) => [...prev, { localId: makeLocalRowId(), category: "", actual: "", budget: "" }])}
                    >
                      Add Income Row
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground/90 px-1">
                    <div className="col-span-12 sm:col-span-6">Category</div>
                    <div className="col-span-4 sm:col-span-2 text-right">Actual</div>
                    <div className="col-span-4 sm:col-span-2 text-right">Budget</div>
                    <div className="col-span-4 sm:col-span-2 text-right">Actions</div>
                  </div>
                  {reviewIncomeRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No income sources were extracted.</p>
                  ) : (
                    <div className="space-y-2">
                      {reviewIncomeRows.map((row) => (
                        <div key={row.localId} className="grid grid-cols-12 gap-2 items-center border border-border/50 rounded-md p-2 bg-card/40">
                          <Input className="col-span-12 sm:col-span-6 bg-muted/35 border-border/60" placeholder="Category" value={row.category} onChange={(e) => setReviewIncomeRows((prev) => prev.map((r) => r.localId === row.localId ? { ...r, category: e.target.value } : r))} />
                          <div className="col-span-4 sm:col-span-2 relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                            <Input className="pl-5 text-right bg-muted/35 border-border/60" inputMode="decimal" placeholder="0" value={row.actual} onChange={(e) => setReviewIncomeRows((prev) => prev.map((r) => r.localId === row.localId ? { ...r, actual: sanitizeNumericInput(e.target.value) } : r))} />
                          </div>
                          <div className="col-span-4 sm:col-span-2 relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                            <Input className="pl-5 text-right bg-muted/35 border-border/60" inputMode="decimal" placeholder="" value={row.budget} onChange={(e) => setReviewIncomeRows((prev) => prev.map((r) => r.localId === row.localId ? { ...r, budget: sanitizeNumericInput(e.target.value) } : r))} />
                          </div>
                          <div className="col-span-4 sm:col-span-2 flex justify-end">
                            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-500/10 hover:text-red-300" aria-label="Remove row" onClick={() => setReviewIncomeRows((prev) => prev.filter((r) => r.localId !== row.localId))}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Expenses</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewExpenseRows((prev) => [...prev, { localId: makeLocalRowId(), category: "", actual: "", budget: "" }])}
                    >
                      Add Expense Row
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground/90 px-1">
                    <div className="col-span-12 sm:col-span-6">Category</div>
                    <div className="col-span-4 sm:col-span-2 text-right">Actual</div>
                    <div className="col-span-4 sm:col-span-2 text-right">Budget</div>
                    <div className="col-span-4 sm:col-span-2 text-right">Actions</div>
                  </div>
                  {reviewExpenseRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No expenses were extracted.</p>
                  ) : (
                    <div className="space-y-2">
                      {reviewExpenseRows.map((row) => (
                        <div key={row.localId} className="grid grid-cols-12 gap-2 items-center border border-border/50 rounded-md p-2 bg-card/40">
                          <Input className="col-span-12 sm:col-span-6 bg-muted/35 border-border/60" placeholder="Category" value={row.category} onChange={(e) => setReviewExpenseRows((prev) => prev.map((r) => r.localId === row.localId ? { ...r, category: e.target.value } : r))} />
                          <div className="col-span-4 sm:col-span-2 relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                            <Input className="pl-5 text-right bg-muted/35 border-border/60" inputMode="decimal" placeholder="0" value={row.actual} onChange={(e) => setReviewExpenseRows((prev) => prev.map((r) => r.localId === row.localId ? { ...r, actual: sanitizeNumericInput(e.target.value) } : r))} />
                          </div>
                          <div className="col-span-4 sm:col-span-2 relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                            <Input className="pl-5 text-right bg-muted/35 border-border/60" inputMode="decimal" placeholder="" value={row.budget} onChange={(e) => setReviewExpenseRows((prev) => prev.map((r) => r.localId === row.localId ? { ...r, budget: sanitizeNumericInput(e.target.value) } : r))} />
                          </div>
                          <div className="col-span-4 sm:col-span-2 flex justify-end">
                            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-500/10 hover:text-red-300" aria-label="Remove row" onClick={() => setReviewExpenseRows((prev) => prev.filter((r) => r.localId !== row.localId))}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                  <label className="text-sm font-semibold text-foreground">Notes</label>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full min-h-[120px] bg-muted/35 border-border/60"
                    placeholder="Add notes"
                  />
                </div>
              </div>
            ) : analysisDispatchResult?.status === "failed" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <h3 className="text-sm font-semibold text-red-300 mb-1">Financial analysis failed.</h3>
                  <p className="text-sm text-red-200">{importFailureMessage || "Unable to extract financial data."}</p>
                </div>
              </div>
            ) : (
              <>
                {uploadedFinancialPdfResult && !analysisDispatchResult && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200 flex items-center justify-between gap-3">
                    <span>
                      The PDF was uploaded, but analysis could not be started. Please try again.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!uploadedFinancialPdfResult?.documentId || !uploadedFinancialPdfResult?.tenantSlug) {
                          toast.error("Unable to retry analysis for this file.");
                          return;
                        }
                        void startAnalysisDispatch({
                          documentId: uploadedFinancialPdfResult.documentId,
                          month: uploadedFinancialPdfResult.selectedMonth,
                          year: uploadedFinancialPdfResult.selectedYear,
                          tenantSlug: uploadedFinancialPdfResult.tenantSlug,
                          fileName: uploadedFinancialPdfResult.fileName,
                        });
                      }}
                      disabled={isUploadingImport || isDispatchingAnalysis}
                    >
                      {isDispatchingAnalysis ? "Starting analysis…" : "Retry Analysis"}
                    </Button>
                  </div>
                )}
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">Financial Period</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="import-month" className="block text-xs text-muted-foreground mb-1">Month</label>
                        <select
                          id="import-month"
                          value={selectedImportMonth}
                          onChange={(e) => setSelectedImportMonth(Number(e.target.value))}
                          className="w-full bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {MONTHS_LONG.map((monthName, idx) => (
                            <option key={monthName} value={idx + 1}>{monthName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="import-year" className="block text-xs text-muted-foreground mb-1">Year</label>
                        <select
                          id="import-year"
                          value={selectedImportYear}
                          onChange={(e) => setSelectedImportYear(Number(e.target.value))}
                          className="w-full bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {years.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Selected period: {MONTHS_LONG[Math.max(0, (selectedImportMonth || 1) - 1)]} {selectedImportYear}
                    </p>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(false);
                      validateAndSetPdfFile(e.dataTransfer?.files ?? null);
                    }}
                    className={
                      `rounded-lg border-2 border-dashed p-5 text-center transition-colors ` +
                      (isDragActive
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50")
                    }
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <p className="text-sm text-foreground">Drag and drop a PDF here, or</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse File
                      </Button>
                      <p className="text-xs text-muted-foreground">PDF only • One file</p>
                    </div>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => validateAndSetPdfFile(e.target.files)}
                    />
                  </div>

                  {uploadError && (
                    <p className="text-sm text-red-400">{uploadError}</p>
                  )}

                  {selectedPdfFile && (
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{selectedPdfFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedPdfFile.size)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={clearSelectedPdfFile}
                        aria-label="Remove selected file"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

              </>
            )}
            </div>

            <div className="sticky bottom-0 z-10 border-t border-border/80 bg-card/95 backdrop-blur px-6 py-4">
              {analysisDispatchResult?.status === "processing" && statusCheckError ? (
                <DialogFooter className="m-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStatusCheckError(null);
                      setStatusPollingEnabled(true);
                      void importStatusQuery.refetch();
                    }}
                  >
                    Retry Status Check
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setAnalysisDispatchResult(null);
                      setUploadedFinancialPdfResult(null);
                      setImportFailureMessage(null);
                      setStatusCheckError(null);
                      setStatusPollingEnabled(true);
                      setReviewIncomeRows([]);
                      setReviewExpenseRows([]);
                      setReviewSpecialTotals(defaultReviewSpecialTotals());
                      setCameronSummary("");
                      setReviewNotes("");
                      setSelectedPdfFile(null);
                      setUploadError("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    Choose Another PDF
                  </Button>
                </DialogFooter>
              ) : analysisDispatchResult?.status === "failed" ? (
                <DialogFooter className="m-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!uploadedFinancialPdfResult?.documentId || !uploadedFinancialPdfResult?.tenantSlug) {
                        toast.error("Unable to retry analysis for this file.");
                        return;
                      }
                      void startAnalysisDispatch({
                        documentId: uploadedFinancialPdfResult.documentId,
                        month: uploadedFinancialPdfResult.selectedMonth,
                        year: uploadedFinancialPdfResult.selectedYear,
                        tenantSlug: uploadedFinancialPdfResult.tenantSlug,
                        fileName: uploadedFinancialPdfResult.fileName,
                      });
                    }}
                    disabled={isDispatchingAnalysis}
                  >
                    {isDispatchingAnalysis ? "Starting analysis…" : "Retry Analysis"}
                  </Button>
                  <Button type="button" onClick={resetImportDialogState}>Choose Another PDF</Button>
                </DialogFooter>
              ) : analysisDispatchResult?.status === "ready_for_review" ? (
                <DialogFooter className="m-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestCloseImportDialog}
                    disabled={isSavingReviewedPeriod}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveReviewedPeriod}
                    disabled={isSavingReviewedPeriod || rewriteSummaryWithAiMutation.isPending || createSummaryVersionMutation.isPending || restoreSummaryVersionMutation.isPending}
                  >
                    {isSavingReviewedPeriod ? "Saving…" : "Save Financial Period"}
                  </Button>
                </DialogFooter>
              ) : (
                <DialogFooter className="m-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestCloseImportDialog}
                    disabled={isUploadingImport || isDispatchingAnalysis}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAnalyzePlaceholder}
                    disabled={isUploadingImport || isDispatchingAnalysis || !selectedPdfFile || !selectedImportMonth || !selectedImportYear}
                  >
                    {isUploadingImport ? "Uploading…" : isDispatchingAnalysis ? "Starting analysis…" : "Upload & Analyze"}
                  </Button>
                </DialogFooter>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
          <DialogContent className="w-[95vw] max-w-[calc(100vw-2rem)] sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>
                {confirmCloseMode === "discard_review" ? "Discard unsaved changes?" : "Cancel financial import?"}
              </DialogTitle>
              <DialogDescription>
                {confirmCloseMode === "discard_review"
                  ? "You have unsaved changes to this financial review. Closing now will discard them."
                  : "This will stop the current import flow and clear the selected file and progress."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmCloseOpen(false);
                  setConfirmCloseMode(null);
                }}
              >
                {confirmCloseMode === "discard_review" ? "Keep Editing" : "Continue Import"}
              </Button>
              <Button type="button" onClick={handleDiscardAndClose}>
                {confirmCloseMode === "discard_review" ? "Discard Changes" : "Cancel Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!historyViewVersion} onOpenChange={(open) => { if (!open) setHistoryViewVersion(null); }}>
          <DialogContent className="w-[95vw] max-w-[calc(100vw-2rem)] sm:max-w-[760px]">
            <DialogHeader>
              <DialogTitle>{historyViewVersion ? `Version ${historyViewVersion.versionNumber}` : "Version"}</DialogTitle>
              <DialogDescription>
                {historyViewVersion ? `${new Date(historyViewVersion.createdAt).toLocaleString()} • ${historyViewVersion.changeSource}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{historyViewVersion?.summary ?? ""}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHistoryViewVersion(null)}>Close</Button>
              <Button
                type="button"
                onClick={() => {
                  setHistoryRestoreVersion(historyViewVersion);
                  setHistoryViewVersion(null);
                }}
              >
                Restore this version
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!historyRestoreVersion} onOpenChange={(open) => { if (!open) setHistoryRestoreVersion(null); }}>
          <DialogContent className="w-[95vw] max-w-[calc(100vw-2rem)] sm:max-w-[760px]">
            <DialogHeader>
              <DialogTitle>Restore this summary version?</DialogTitle>
              <DialogDescription>
                This will replace the current summary in the editor. The financial period will not be saved automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3 max-h-[280px] overflow-y-auto">
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{historyRestoreVersion?.summary ?? ""}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHistoryRestoreVersion(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleRestoreSummaryVersion} disabled={restoreSummaryVersionMutation.isPending}>
                {restoreSummaryVersionMutation.isPending ? "Restoring..." : "Restore Version"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
