import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, Users, Target, ArrowUpRight, Pencil, CheckCircle2, XCircle, Check, X,
} from "lucide-react";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const RED = "oklch(0.62 0.22 25)";
const AMBER = "oklch(0.78 0.16 60)";
const BLUE = "oklch(0.65 0.18 250)";
const MUTED_FG = "oklch(0.50 0.008 240)";

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

type EditState = {
  target: string;
  actual: string;
  referrals: string;
  outbound: string;
};

export default function SalesTracker() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based
  const [year, setYear] = useState(currentYear);
  const { impersonatingTenantSlug } = usePortal();
  const { data: tenant } = trpc.tenant.me.useQuery(undefined, { enabled: !impersonatingTenantSlug });
  const tslug = impersonatingTenantSlug ?? tenant?.slug ?? null;

  // Year range: 3 years back to 1 year ahead
  const years = Array.from({ length: 5 }, (_, i) => currentYear + 1 - i);

  const { data: salesByYear = [], isLoading, refetch } = trpc.sales.getByYear.useQuery(
    { year, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug, staleTime: 30_000 }
  );

  // Previous year data for Close Rate Reference
  const { data: prevYearData = [] } = trpc.sales.getByYear.useQuery(
    { year: year - 1, tenantSlug: tslug ?? undefined },
    { enabled: !!tslug, staleTime: 60_000 }
  );

  const upsertMutation = trpc.sales.upsert.useMutation({
    onSuccess: () => { refetch(); },
  });

  // Inline edit state: keyed by month number
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ target: "", actual: "", referrals: "", outbound: "" });

  // Build all 12 months, merging with DB data
  const allMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const rec = salesByYear.find(s => s.month === month);
      return {
        month,
        goal_clients: rec?.goal_clients ?? 0,
        signed_clients: rec?.signed_clients ?? 0,
        referral_count: rec?.referral_count ?? 0,
        outbound_count: rec?.outbound_count ?? 0,
        hasData: !!rec,
      };
    });
  }, [salesByYear]);

  const ytdSigned = useMemo(() => salesByYear.reduce((s, m) => s + (m.signed_clients ?? 0), 0), [salesByYear]);
  const ytdGoal = useMemo(() => salesByYear.reduce((s, m) => s + (m.goal_clients ?? 0), 0), [salesByYear]);
  const ytdReferrals = useMemo(() => salesByYear.reduce((s, m) => s + (m.referral_count ?? 0), 0), [salesByYear]);
  const ytdOutbound = useMemo(() => salesByYear.reduce((s, m) => s + (m.outbound_count ?? 0), 0), [salesByYear]);
  const ytdAchievement = ytdGoal > 0 ? Math.min((ytdSigned / ytdGoal) * 100, 100) : 0;
  const referralRate = ytdSigned > 0 ? (ytdReferrals / ytdSigned) * 100 : 0;
  const conversionRate = (ytdReferrals + ytdOutbound) > 0
    ? (ytdSigned / (ytdReferrals + ytdOutbound)) * 100
    : 0;

  // Previous year stats for Close Rate Reference
  const prevSigned = prevYearData.reduce((s, m) => s + (m.signed_clients ?? 0), 0);
  const prevGoal = prevYearData.reduce((s, m) => s + (m.goal_clients ?? 0), 0);
  const prevReferrals = prevYearData.reduce((s, m) => s + (m.referral_count ?? 0), 0);
  const prevOutbound = prevYearData.reduce((s, m) => s + (m.outbound_count ?? 0), 0);
  const prevCloseRate = (prevReferrals + prevOutbound) > 0
    ? (prevSigned / (prevReferrals + prevOutbound)) * 100
    : 0;
  const prevReferralPct = prevSigned > 0 ? (prevReferrals / prevSigned) * 100 : 0;

  const chartData = MONTHS_SHORT.map((month, i) => {
    const rec = allMonths[i];
    return {
      month,
      Signed: rec.signed_clients,
      Target: rec.goal_clients,
      Referrals: rec.referral_count,
    };
  });

  function startEdit(month: number) {
    const row = allMonths[month - 1];
    setEditState({
      target: String(row.goal_clients),
      actual: String(row.signed_clients),
      referrals: String(row.referral_count),
      outbound: String(row.outbound_count),
    });
    setEditingMonth(month);
  }

  function cancelEdit() {
    setEditingMonth(null);
  }

  function saveEdit(month: number) {
    if (!tslug) return;
    upsertMutation.mutate({
      tenantSlug: tslug,
      year,
      month,
      goalClients: parseInt(editState.target) || 0,
      signedClients: parseInt(editState.actual) || 0,
      referralCount: parseInt(editState.referrals) || 0,
      outboundCount: parseInt(editState.outbound) || 0,
    });
    setEditingMonth(null);
  }

  const isFutureMonth = (month: number) =>
    year > currentYear || (year === currentYear && month > currentMonth);

  const isCurrentMonth = (month: number) =>
    year === currentYear && month === currentMonth;

  function getStatusIcon(row: typeof allMonths[0]) {
    if (isFutureMonth(row.month)) {
      return <span className="text-muted-foreground text-base">—</span>;
    }
    const met = row.goal_clients > 0 && row.signed_clients >= row.goal_clients;
    if (met) {
      return <CheckCircle2 size={20} style={{ color: GREEN }} />;
    }
    return <XCircle size={20} style={{ color: RED }} />;
  }

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sales Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{year} performance</p>
          </div>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* YTD KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Signed YTD", value: String(ytdSigned), sub: `Goal: ${ytdGoal}`, color: TEAL, icon: <Users size={16} /> },
            { label: "Goal Achievement", value: fmtPct(ytdAchievement), sub: ytdAchievement >= 100 ? "Goal reached!" : `${ytdGoal - ytdSigned} remaining`, color: ytdAchievement >= 100 ? GREEN : TEAL, icon: <Target size={16} /> },
            { label: "Referral Rate", value: fmtPct(referralRate), sub: `${ytdReferrals} referrals`, color: GREEN, icon: <ArrowUpRight size={16} /> },
            { label: "Conversion Rate", value: fmtPct(conversionRate), sub: `${ytdOutbound} outbound`, color: AMBER, icon: <TrendingUp size={16} /> },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
                <span className="text-muted-foreground">{card.icon}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Annual Goal Progress */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Annual Goal Progress</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{ytdSigned} signed of {ytdGoal} annual goal</p>
            </div>
            <span className="text-lg font-bold" style={{ color: ytdAchievement >= 100 ? GREEN : TEAL }}>
              {fmtPct(ytdAchievement)}
            </span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-700"
              style={{ width: `${ytdAchievement}%`, backgroundColor: ytdAchievement >= 100 ? GREEN : TEAL }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>0</span>
            <span>{ytdGoal} clients</span>
          </div>
        </div>

        {/* Monthly Bar Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{year} — Monthly Signed vs Target</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: MUTED_FG, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: MUTED_FG }} />
              <Bar dataKey="Signed" fill={TEAL} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Target" fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Referrals" fill={AMBER} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Breakdown Table — all 12 months */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Monthly Breakdown</h2>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Month</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Target</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Actual</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Referrals</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Outbound</th>
                  <th className="text-center px-5 py-3 text-xs text-muted-foreground font-medium">Status</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {allMonths.map(row => {
                  const isFuture = isFutureMonth(row.month);
                  const isCurrent = isCurrentMonth(row.month);
                  const isEditing = editingMonth === row.month;
                  const rowMuted = isFuture && !isEditing;

                  return (
                    <tr
                      key={row.month}
                      className={`border-b border-border/50 ${isEditing ? "bg-muted/20" : "hover:bg-muted/10"}`}
                    >
                      {/* Month label */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${rowMuted ? "text-muted-foreground" : "text-foreground"}`}>
                            {MONTHS_SHORT[row.month - 1]} {year}
                          </span>
                          {isCurrent && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded font-medium"
                              style={{ backgroundColor: `${TEAL}22`, color: TEAL, border: `1px solid ${TEAL}44` }}
                            >
                              Current
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Target */}
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editState.target}
                            onChange={e => setEditState(s => ({ ...s, target: e.target.value }))}
                            className="w-16 bg-background border border-border rounded px-2 py-0.5 text-sm text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span className={rowMuted ? "text-muted-foreground" : "text-muted-foreground"}>
                            {row.goal_clients}
                          </span>
                        )}
                      </td>

                      {/* Actual */}
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editState.actual}
                            onChange={e => setEditState(s => ({ ...s, actual: e.target.value }))}
                            className="w-16 bg-background border border-border rounded px-2 py-0.5 text-sm text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span
                            className={`font-bold ${rowMuted ? "" : ""}`}
                            style={{ color: rowMuted ? MUTED_FG : (row.signed_clients > 0 ? TEAL : MUTED_FG) }}
                          >
                            {row.signed_clients}
                          </span>
                        )}
                      </td>

                      {/* Referrals */}
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editState.referrals}
                            onChange={e => setEditState(s => ({ ...s, referrals: e.target.value }))}
                            className="w-16 bg-background border border-border rounded px-2 py-0.5 text-sm text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span style={{ color: rowMuted ? MUTED_FG : (row.referral_count > 0 ? GREEN : MUTED_FG) }}>
                            {row.referral_count}
                          </span>
                        )}
                      </td>

                      {/* Outbound */}
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editState.outbound}
                            onChange={e => setEditState(s => ({ ...s, outbound: e.target.value }))}
                            className="w-16 bg-background border border-border rounded px-2 py-0.5 text-sm text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span style={{ color: rowMuted ? MUTED_FG : (row.outbound_count > 0 ? AMBER : MUTED_FG) }}>
                            {row.outbound_count}
                          </span>
                        )}
                      </td>

                      {/* Status icon */}
                      <td className="px-5 py-3 text-center">
                        {isEditing ? null : getStatusIcon(row)}
                      </td>

                      {/* Edit / Save / Cancel */}
                      <td className="px-3 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => saveEdit(row.month)}
                              disabled={upsertMutation.isPending}
                              className="p-1 rounded hover:bg-muted/30 text-green-400 disabled:opacity-50"
                              title="Save"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 rounded hover:bg-muted/30 text-muted-foreground"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row.month)}
                            className="p-1 rounded hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-5 py-3 font-semibold text-foreground text-xs uppercase tracking-wider">YTD Total</td>
                  <td className="px-5 py-3 text-right font-semibold text-foreground">{ytdGoal}</td>
                  <td className="px-5 py-3 text-right font-bold" style={{ color: TEAL }}>{ytdSigned}</td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: GREEN }}>{ytdReferrals}</td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: AMBER }}>{ytdOutbound}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="text-xs font-bold" style={{ color: ytdAchievement >= 100 ? GREEN : TEAL }}>
                      {fmtPct(ytdAchievement)}
                    </span>
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Close Rate Reference — previous year */}
        {prevYearData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">{year - 1} Close Rate Reference</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Historical baseline from your {year - 1} sales data</p>
            </div>
            <div className="grid grid-cols-3 gap-6 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground">{prevSigned}</div>
                <div className="text-xs text-muted-foreground mt-1">Clients Signed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: BLUE }}>{prevReferrals}</div>
                <div className="text-xs text-muted-foreground mt-1">Referrals</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: TEAL }}>{fmtPct(prevCloseRate)}</div>
                <div className="text-xs text-muted-foreground mt-1">Close Rate</div>
              </div>
            </div>
            {prevSigned > 0 && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{ backgroundColor: `${TEAL}11`, border: `1px solid ${TEAL}33` }}
              >
                <span className="font-semibold" style={{ color: TEAL }}>Insight: </span>
                <span className="text-muted-foreground">
                  {prevReferralPct >= 25
                    ? `${prevReferralPct.toFixed(0)}% of your ${year - 1} closes came from referrals — a strong signal. Increasing referral activation is your highest-leverage growth lever.`
                    : prevReferralPct > 0
                    ? `${prevReferralPct.toFixed(0)}% of your ${year - 1} closes came from referrals. There's room to grow your referral channel to reduce outbound dependency.`
                    : `No referral data recorded for ${year - 1}. Consider tracking referral sources to identify your highest-leverage growth lever.`
                  }
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
