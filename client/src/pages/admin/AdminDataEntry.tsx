import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { trpc } from "../../lib/trpc";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function AdminDataEntry() {
  const now = new Date();
  const [tenantSlug, setTenantSlug] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const { data: tenants } = trpc.tenant.list.useQuery();

  // ── Financials ──────────────────────────────────────────────────────────────
  const [fin, setFin] = useState({ revenue: "", expenses: "", netProfit: "", netProfitMargin: "", budgetRevenue: "", budgetExpenses: "", summary: "" });
  const upsertFin = trpc.financials.upsert.useMutation({ onSuccess: () => toast.success("Financials saved") });

  // ── Line Items ──────────────────────────────────────────────────────────────
  const [li, setLi] = useState({ type: "income" as "income" | "expense", label: "", amount: "" });
  const addLi = trpc.financials.addLineItem.useMutation({ onSuccess: () => { toast.success("Line item added"); setLi({ type: "income", label: "", amount: "" }); } });

  // ── Coaching ────────────────────────────────────────────────────────────────
  const currentQNum = Math.ceil((now.getMonth() + 1) / 3);
  const [coachingQuarter, setCoachingQuarter] = useState(String(currentQNum));
  const [coachingTitle, setCoachingTitle] = useState("");
  const [coachingNotes, setCoachingNotes] = useState("");
  const addCoaching = trpc.coaching.add.useMutation({ onSuccess: () => { toast.success("Coaching item added"); setCoachingTitle(""); setCoachingNotes(""); } });

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const [kpi, setKpi] = useState({ cac: "", churnRate: "", ltv: "" });
  const upsertKpi = trpc.kpi.upsert.useMutation({ onSuccess: () => toast.success("KPI metrics saved") });

  // ── Time ────────────────────────────────────────────────────────────────────
  const [time, setTime] = useState({ focusArea: "", hours: "", delegationNote: "" });
  const addTime = trpc.time.add.useMutation({ onSuccess: () => { toast.success("Time log added"); setTime({ focusArea: "", hours: "", delegationNote: "" }); } });

  // ── Sales ───────────────────────────────────────────────────────────────────
  const [sales, setSales] = useState({ goalClients: "", signedClients: "", referralCount: "", outboundCount: "" });
  const upsertSales = trpc.sales.upsert.useMutation({ onSuccess: () => toast.success("Sales data saved") });

  // ── Monthly Summary ─────────────────────────────────────────────────────────
  const [summaryText, setSummaryText] = useState("");
  const saveSummary = trpc.financials.updateSummary.useMutation({ onSuccess: () => { toast.success("Monthly summary saved"); setSummaryText(""); } });

  // ── Document Upload ─────────────────────────────────────────────────────────
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const uploadDoc = trpc.documents.upload.useMutation({ onSuccess: () => { toast.success("Document uploaded"); setDocName(""); setDocFile(null); } });

  const yr = Number(year);
  const mo = Number(month);

  async function handleDocUpload() {
    if (!docFile || !tenantSlug) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadDoc.mutate({ tenantSlug, name: docName || docFile.name, year: yr, fileBase64: base64, mimeType: docFile.type });
    };
    reader.readAsDataURL(docFile);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">Enter and manage client data across all portal sections</p>
      </div>

      {/* Global selectors */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Client *</Label>
              <Select value={tenantSlug} onValueChange={setTenantSlug}>
                <SelectTrigger className="bg-background border-border text-sm h-9">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {(tenants ?? []).map((t) => (
                    <SelectItem key={t.slug} value={t.slug} className="text-sm">
                      {t.company_name ?? t.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="bg-background border-border text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {years.map((y) => <SelectItem key={y} value={y} className="text-sm">{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="bg-background border-border text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)} className="text-sm">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="financials" className="space-y-4">
        <TabsList className="bg-card border border-border">
          {["financials", "coaching", "documents", "kpi", "time", "sales", "summary"].map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {t === "summary" ? "Monthly Summary" : t}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Financials */}
        <TabsContent value="financials" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Monthly Financials</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[["revenue","Revenue"],["expenses","Expenses"],["netProfit","Net Profit"],["netProfitMargin","Margin (0-1)"],["budgetRevenue","Budget Revenue"],["budgetExpenses","Budget Expenses"]].map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
                    <Input value={fin[key as keyof typeof fin]} onChange={(e) => setFin({ ...fin, [key]: e.target.value })} placeholder="0.00" className="bg-background border-border text-sm h-9" />
                  </div>
                ))}
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || upsertFin.isPending} onClick={() => upsertFin.mutate({
                tenantSlug, year: yr, month: mo,
                revenue: Number(fin.revenue), expenses: Number(fin.expenses),
                netProfit: Number(fin.netProfit), netProfitMargin: Number(fin.netProfitMargin),
                budgetRevenue: Number(fin.budgetRevenue), budgetExpenses: Number(fin.budgetExpenses),
                summary: fin.summary || null,
              })}>
                {upsertFin.isPending ? "Saving…" : "Save Financials"}
              </Button>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Add Line Item</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
                  <Select value={li.type} onValueChange={(v) => setLi({ ...li, type: v as any })}>
                    <SelectTrigger className="bg-background border-border text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="income" className="text-sm">Income</SelectItem>
                      <SelectItem value="expense" className="text-sm">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Label</Label>
                  <Input value={li.label} onChange={(e) => setLi({ ...li, label: e.target.value })} placeholder="e.g. Consulting Fees" className="bg-background border-border text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Amount</Label>
                  <Input value={li.amount} onChange={(e) => setLi({ ...li, amount: e.target.value })} placeholder="0.00" className="bg-background border-border text-sm h-9" />
                </div>
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || !li.label || !li.amount || addLi.isPending} onClick={() => addLi.mutate({ tenantSlug, year: yr, month: mo, type: li.type, label: li.label, amount: Number(li.amount) })}>
                {addLi.isPending ? "Adding…" : "Add Line Item"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coaching */}
        <TabsContent value="coaching">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Add Coaching Item</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Quarter (1-4)</Label>
                  <Select value={coachingQuarter} onValueChange={setCoachingQuarter}>
                    <SelectTrigger className="bg-background border-border text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {[1,2,3,4].map((q) => <SelectItem key={q} value={String(q)} className="text-sm">Q{q}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Goal / Action Item</Label>
                <Input value={coachingTitle} onChange={(e) => setCoachingTitle(e.target.value)} placeholder="e.g. Increase revenue by 15%" className="bg-background border-border text-sm h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</Label>
                <Textarea value={coachingNotes} onChange={(e) => setCoachingNotes(e.target.value)} placeholder="Additional context or instructions…" className="bg-background border-border text-sm min-h-[80px]" />
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || !coachingTitle || addCoaching.isPending} onClick={() => addCoaching.mutate({ tenantSlug, year: yr, quarter: Number(coachingQuarter), title: coachingTitle, description: coachingNotes || undefined })}>
                {addCoaching.isPending ? "Adding…" : "Add Item"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Upload Document</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Document Name (optional)</Label>
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Leave blank to use filename" className="bg-background border-border text-sm h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">File</Label>
                <input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || !docFile || uploadDoc.isPending} onClick={handleDocUpload}>
                {uploadDoc.isPending ? "Uploading…" : "Upload to Vault"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* KPI */}
        <TabsContent value="kpi">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">KPI Metrics</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[["cac","CAC ($)"],["churnRate","Churn Rate (%)"],["ltv","LTV ($)"]].map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
                    <Input value={kpi[key as keyof typeof kpi]} onChange={(e) => setKpi({ ...kpi, [key]: e.target.value })} placeholder="0.00" className="bg-background border-border text-sm h-9" />
                  </div>
                ))}
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || upsertKpi.isPending} onClick={() => upsertKpi.mutate({
                tenantSlug, year: yr, month: mo,
                cac: kpi.cac ? Number(kpi.cac) : undefined,
                churnRate: kpi.churnRate ? Number(kpi.churnRate) : undefined,
                ltv: kpi.ltv ? Number(kpi.ltv) : undefined,
              })}>
                {upsertKpi.isPending ? "Saving…" : "Save KPI"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time */}
        <TabsContent value="time">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Add Time Log Entry</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Focus Area</Label>
                  <Input value={time.focusArea} onChange={(e) => setTime({ ...time, focusArea: e.target.value })} placeholder="e.g. Client Calls" className="bg-background border-border text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Hours</Label>
                  <Input value={time.hours} onChange={(e) => setTime({ ...time, hours: e.target.value })} placeholder="e.g. 12.5" className="bg-background border-border text-sm h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Delegation Note (optional)</Label>
                <Textarea value={time.delegationNote} onChange={(e) => setTime({ ...time, delegationNote: e.target.value })} placeholder="e.g. Consider delegating email triage to a VA" className="bg-background border-border text-sm min-h-[80px]" />
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || !time.focusArea || !time.hours || addTime.isPending} onClick={() => addTime.mutate({
                year: yr, month: mo,
                focusArea: time.focusArea, hours: Number(time.hours),
                delegationNote: time.delegationNote || undefined,
              })}>
                {addTime.isPending ? "Adding…" : "Add Time Entry"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales */}
        <TabsContent value="sales">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Sales Tracker Data</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[["goalClients","Goal (clients)"],["signedClients","Signed"],["referralCount","Referral"],["outboundCount","Outbound"]].map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
                    <Input value={sales[key as keyof typeof sales]} onChange={(e) => setSales({ ...sales, [key]: e.target.value })} placeholder="0" className="bg-background border-border text-sm h-9" />
                  </div>
                ))}
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tenantSlug || upsertSales.isPending} onClick={() => upsertSales.mutate({
                tenantSlug, year: yr, month: mo,
                goalClients: Number(sales.goalClients), signedClients: Number(sales.signedClients),
                referralCount: Number(sales.referralCount), outboundCount: Number(sales.outboundCount),
              })}>
                {upsertSales.isPending ? "Saving…" : "Save Sales Data"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Summary */}
        <TabsContent value="summary">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Monthly Financial Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Write a summary for the selected client's monthly financial report. This will be visible to the client as a collapsible section in their Financials tab.
              </p>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Summary Text</Label>
                <Textarea
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="e.g. January was a strong month — revenue exceeded budget by 12%. Key drivers were the new retainer signed with ABC Corp and a reduction in software expenses. Net profit margin improved to 38%, above the 35% target. Recommended focus for February: continue outbound outreach and review subscription costs."
                  className="bg-background border-border text-sm min-h-[160px]"
                />
              </div>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground"
                disabled={!tenantSlug || !summaryText.trim() || saveSummary.isPending}
                onClick={() => saveSummary.mutate({ tenantSlug, year: yr, month: mo, summary: summaryText })}
              >
                {saveSummary.isPending ? "Saving…" : "Save Summary"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Note: Saving here will only update the summary field. Financial figures are not overwritten if already set — use the Financials tab to update numbers.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
