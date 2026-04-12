import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Users, TrendingUp, DollarSign, Clock, Plus, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  legacy: "Legacy",
  momentum: "Momentum",
  growth_1: "Growth 1",
  growth_2: "Growth 2",
  cfo: "CFO",
};

const TIER_COLORS: Record<string, string> = {
  legacy: "bg-zinc-700 text-zinc-300",
  momentum: "bg-blue-900 text-blue-300",
  growth_1: "bg-emerald-900 text-emerald-300",
  growth_2: "bg-teal-900 text-teal-300",
  cfo: "bg-amber-900 text-amber-300",
};

const TIER_ORDER = ["legacy", "momentum", "growth_1", "growth_2", "cfo"];

function formatCurrency(val: string | number | null | undefined) {
  if (val === null || val === undefined) return "$0";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "$0";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function calcTenure(signedAt: Date | string) {
  const signed = new Date(signedAt);
  const now = new Date();
  const months =
    (now.getFullYear() - signed.getFullYear()) * 12 + (now.getMonth() - signed.getMonth());
  if (months < 1) return "< 1 mo";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
}

export default function Clients() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "churned">("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    clientName: "",
    packageTier: "legacy" as string,
    monthlyFee: "",
    signedAt: new Date().toISOString().slice(0, 10),
    status: "active" as "active" | "churned",
  });

  const { data: roster = [], refetch } = trpc.clientRoster.list.useQuery({});
  const addMutation = trpc.clientRoster.add.useMutation({
    onSuccess: () => {
      toast.success("Client added successfully");
      refetch();
      setAddOpen(false);
      setNewClient({ clientName: "", packageTier: "legacy", monthlyFee: "", signedAt: new Date().toISOString().slice(0, 10), status: "active" });
    },
    onError: (e) => toast.error(e.message),
  });

  // Tier summary stats
  const tierStats = TIER_ORDER.map((tier) => {
    const clients = roster.filter((c) => c.packageTier === tier && c.status === "active");
    const totalIncome = clients.reduce((s, c) => s + parseFloat(String(c.totalIncome || "0")), 0);
    const avgFee = clients.length > 0
      ? clients.reduce((s, c) => s + parseFloat(String(c.monthlyFee || "0")), 0) / clients.length
      : 0;
    const avgTenureMonths = clients.length > 0
      ? clients.reduce((s, c) => {
          const signed = new Date(c.signedAt);
          const now = new Date();
          return s + (now.getFullYear() - signed.getFullYear()) * 12 + (now.getMonth() - signed.getMonth());
        }, 0) / clients.length
      : 0;
    const ltv = avgFee * avgTenureMonths;
    return { tier, count: clients.length, avgFee, ltv, totalIncome };
  });

  const activeCount = roster.filter((c) => c.status === "active").length;
  const churnedCount = roster.filter((c) => c.status === "churned").length;

  // Filtered list
  const filtered = roster.filter((c) => {
    const matchSearch = c.clientName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchTier = tierFilter === "all" || c.packageTier === tierFilter;
    return matchSearch && matchStatus && matchTier;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Roster</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {activeCount} active · {churnedCount} churned · {roster.length} total
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-teal-600 hover:bg-teal-500 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </Button>
      </div>

      {/* Tier Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {tierStats.map(({ tier, count, avgFee, ltv }) => (
          <div key={tier} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[tier]}`}>
                {TIER_LABELS[tier]}
              </span>
              <Users className="w-4 h-4 text-zinc-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{count}</p>
              <p className="text-xs text-zinc-500">active clients</p>
            </div>
            <div className="space-y-1 pt-1 border-t border-zinc-800">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Avg/mo</span>
                <span className="text-zinc-300">{formatCurrency(avgFee)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Avg LTV</span>
                <span className="text-teal-400">{formatCurrency(ltv)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "churned"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-teal-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700 text-zinc-300">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            <SelectItem value="all" className="text-zinc-300">All Tiers</SelectItem>
            {TIER_ORDER.map((t) => (
              <SelectItem key={t} value={t} className="text-zinc-300">{TIER_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Client Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Client</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Package</th>
              <th className="text-right px-4 py-3 text-zinc-500 font-medium">Monthly Fee</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Signed</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Tenure</th>
              <th className="text-right px-4 py-3 text-zinc-500 font-medium">Total Income</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-zinc-500">
                  {roster.length === 0 ? "No clients added yet. Click 'Add Client' to get started." : "No clients match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr key={client.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{client.clientName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[client.packageTier]}`}>
                      {TIER_LABELS[client.packageTier]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(client.monthlyFee)}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(client.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      client.status === "active"
                        ? "bg-emerald-900/50 text-emerald-400"
                        : "bg-red-900/50 text-red-400"
                    }`}>
                      {client.status === "active" ? "Active" : "Churned"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{calcTenure(client.signedAt)}</td>
                  <td className="px-4 py-3 text-right text-teal-400">{formatCurrency(client.totalIncome)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Client Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Client Name</label>
              <Input
                value={newClient.clientName}
                onChange={(e) => setNewClient({ ...newClient, clientName: e.target.value })}
                placeholder="e.g. Grit Media Group LLC"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Package Tier</label>
              <Select
                value={newClient.packageTier}
                onValueChange={(v) => setNewClient({ ...newClient, packageTier: v })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {TIER_ORDER.map((t) => (
                    <SelectItem key={t} value={t} className="text-zinc-300">{TIER_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Monthly Fee ($)</label>
              <Input
                value={newClient.monthlyFee}
                onChange={(e) => setNewClient({ ...newClient, monthlyFee: e.target.value })}
                placeholder="e.g. 3000"
                type="number"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Signed Date</label>
              <Input
                value={newClient.signedAt}
                onChange={(e) => setNewClient({ ...newClient, signedAt: e.target.value })}
                type="date"
                className="bg-zinc-800 border-zinc-600 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Status</label>
              <Select
                value={newClient.status}
                onValueChange={(v) => setNewClient({ ...newClient, status: v as "active" | "churned" })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="active" className="text-zinc-300">Active</SelectItem>
                  <SelectItem value="churned" className="text-zinc-300">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="border-zinc-600 text-zinc-300">
              Cancel
            </Button>
            <Button
              onClick={() =>
                addMutation.mutate({
                  clientName: newClient.clientName,
                  packageTier: newClient.packageTier as any,
                  monthlyFee: newClient.monthlyFee || "0",
                  signedAt: new Date(newClient.signedAt),
                  status: newClient.status,
                })
              }
              disabled={!newClient.clientName || addMutation.isPending}
              className="bg-teal-600 hover:bg-teal-500 text-white"
            >
              {addMutation.isPending ? "Adding..." : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
