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
  const [tenantId, setTenantId] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const { data: tenants } = trpc.tenant.list.useQuery();

  // ── Financials ──────────────────────────────────────────────────────────────
  const [fin, setFin] = useState({ revenue: "", expenses: "", netProfit: "", margin: "", budgetRevenue: "", budgetExpenses: "" });
  const upsertFin = trpc.financials.upsert.useMutation({ onSuccess: () => toast.success("Financials saved") });

  // ── Line Items ──────────────────────────────────────────────────────────────
  const [li, setLi] = useState({ type: "income" as "income" | "expense", label: "", amount: "" });
  const addLi = trpc.financials.addLineItem.useMutation({ onSuccess: () => { toast.success("Line item added"); setLi({ type: "income", label: "", amount: "" }); } });

  // ── Coaching ────────────────────────────────────────────────────────────────
  const [coaching, setCoaching] = useState({ quarter: `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`, title: "", notes: "" });
  const addCoaching = trpc.coaching.add.useMutation({ onSuccess: () => { toast.success("Coaching item added"); setCoaching({ ...coaching, title: "", notes: "" }); } });

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const [kpi, setKpi] = useState({ cac: "", churnRate: "", ltv: "" });
  const upsertKpi = trpc.kpi.upsert.useMutation({ onSuccess: () => toast.success("KPI metrics saved") });

  // ── Time ────────────────────────────────────────────────────────────────────
  const [time, setTime] = useState({ focusArea: "", hours: "", delegationSuggestion: "" });
  const addTime = trpc.time.add.useMutation({ onSuccess: () => { toast.success("Time log added"); setTime({ focusArea: "", hours: "", delegationSuggestion: "" }); } });

  // ── Sales ───────────────────────────────────────────────────────────────────
  const [sales, setSales] = useState({ goalClients: "", signedClients: "", referralCount: "", outboundCount: "" });
  const upsertSales = trpc.sales.upsert.useMutation({ onSuccess: () => toast.success("Sales data saved") });

  // ── AI Summary ──────────────────────────────────────────────────────────────
  const generateSummary = trpc.aiSummary.generate.useMutation({ onSuccess: () => toast.success("AI summary generated") });

  // ── Document Upload ─────────────────────────────────────────────────────────
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const uploadDoc = trpc.documents.upload.useMutation({ onSuccess: () => { toast.success("Document uploaded"); setDocName(""); setDocFile(null); } });

  const tid = tenantId ? Number(tenantId) : 0;
  const yr = Number(year);
  const mo = Number(month);

  async function handleDocUpload() {
    if (!docFile || !tid) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadDoc.mutate({ tenantId: tid, name: docName || docFile.name, year: yr, fileBase64: base64, mimeType: docFile.type });
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
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="bg-background border-border text-sm h-9">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {(tenants ?? []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)} className="text-sm">
                      {t.companyName ?? `Client #${t.id}`}
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
          {["financials", "coaching", "documents", "kpi", "time", "sales", "ai"].map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {t === "ai" ? "AI Summary" : t}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Financials */}
        <TabsContent value="financials" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Monthly Financials</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[["revenue","Revenue"],["expenses","Expenses"],["netProfit","Net Profit"],["margin","Margin %"],["budgetRevenue","Budget Revenue"],["budgetExpenses","Budget Expenses"]].map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
                    <Input value={fin[key as keyof typeof fin]} onChange={(e) => setFin({ ...fin, [key]: e.target.value })} placeholder="0.00" className="bg-background border-border text-sm h-9" />
                  </div>
                ))}
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || upsertFin.isPending} onClick={() => upsertFin.mutate({ tenantId: tid, year: yr, month: mo, ...fin })}>
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
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || !li.label || !li.amount || addLi.isPending} onClick={() => addLi.mutate({ tenantId: tid, year: yr, month: mo, ...li })}>
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
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Quarter</Label>
                <Input value={coaching.quarter} onChange={(e) => setCoaching({ ...coaching, quarter: e.target.value })} placeholder="e.g. 2026-Q2" className="bg-background border-border text-sm h-9 max-w-xs" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Goal / Action Item</Label>
                <Input value={coaching.title} onChange={(e) => setCoaching({ ...coaching, title: e.target.value })} placeholder="e.g. Increase revenue by 15%" className="bg-background border-border text-sm h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</Label>
                <Textarea value={coaching.notes} onChange={(e) => setCoaching({ ...coaching, notes: e.target.value })} placeholder="Additional context or instructions…" className="bg-background border-border text-sm min-h-[80px]" />
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || !coaching.title || addCoaching.isPending} onClick={() => addCoaching.mutate({ tenantId: tid, ...coaching })}>
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
                <Label className="text-xs text-muted-foreground mb-1.5 block">File Name (optional override)</Label>
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
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || !docFile || uploadDoc.isPending} onClick={handleDocUpload}>
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
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || upsertKpi.isPending} onClick={() => upsertKpi.mutate({ tenantId: tid, year: yr, month: mo, ...kpi })}>
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
                <Label className="text-xs text-muted-foreground mb-1.5 block">Delegation Suggestion (optional)</Label>
                <Textarea value={time.delegationSuggestion} onChange={(e) => setTime({ ...time, delegationSuggestion: e.target.value })} placeholder="e.g. Consider delegating email triage to a VA" className="bg-background border-border text-sm min-h-[80px]" />
              </div>
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || !time.focusArea || !time.hours || addTime.isPending} onClick={() => addTime.mutate({ tenantId: tid, year: yr, month: mo, ...time })}>
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
              <Button size="sm" className="bg-primary text-primary-foreground" disabled={!tid || upsertSales.isPending} onClick={() => upsertSales.mutate({ tenantId: tid, year: yr, month: mo, goalClients: Number(sales.goalClients), signedClients: Number(sales.signedClients), referralCount: Number(sales.referralCount), outboundCount: Number(sales.outboundCount) })}>
                {upsertSales.isPending ? "Saving…" : "Save Sales Data"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Summary */}
        <TabsContent value="ai">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Generate AI Financial Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This will use the existing financial data for the selected client, month, and year to generate an AI-powered summary. Make sure financial data is entered first.
              </p>
              <Button size="sm" className="bg-primary text-primary-foreground gap-2" disabled={!tid || generateSummary.isPending} onClick={() => generateSummary.mutate({ tenantId: tid, year: yr, month: mo })}>
                {generateSummary.isPending ? "Generating…" : "Generate Summary"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
