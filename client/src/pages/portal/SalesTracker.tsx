import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Users, Target, ArrowUpRight } from "lucide-react";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TEAL = "oklch(0.75 0.15 192)";
const GREEN = "oklch(0.68 0.18 145)";
const AMBER = "oklch(0.78 0.16 60)";
const MUTED_FG = "oklch(0.50 0.008 240)";

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

export default function SalesTracker() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { impersonatingTenantSlug } = usePortal();
  const tslug = impersonatingTenantSlug ?? undefined;
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const { data: salesByYear = [], isLoading } = trpc.sales.getByYear.useQuery(
    { year, tenantSlug: tslug },
    { staleTime: 30_000 }
  );

  const ytdSigned = useMemo(() => salesByYear.reduce((s, m) => s + (m.signed_clients ?? 0), 0), [salesByYear]);
  const ytdGoal = useMemo(() => salesByYear.reduce((s, m) => s + (m.goal_clients ?? 0), 0), [salesByYear]);
  const ytdReferrals = useMemo(() => salesByYear.reduce((s, m) => s + (m.referral_count ?? 0), 0), [salesByYear]);
  const ytdOutbound = useMemo(() => salesByYear.reduce((s, m) => s + (m.outbound_count ?? 0), 0), [salesByYear]);
  const ytdAchievement = ytdGoal > 0 ? Math.min((ytdSigned / ytdGoal) * 100, 100) : 0;
  const referralRate = ytdSigned > 0 ? (ytdReferrals / ytdSigned) * 100 : 0;
  const conversionRate = (ytdReferrals + ytdOutbound) > 0
    ? (ytdSigned / (ytdReferrals + ytdOutbound)) * 100
    : 0;

  const chartData = MONTHS_SHORT.map((month, i) => {
    const rec = salesByYear.find(s => s.month === i + 1);
    return {
      month,
      Signed: rec?.signed_clients ?? 0,
      Goal: rec?.goal_clients ?? 0,
      Referrals: rec?.referral_count ?? 0,
    };
  });

  const monthlyRows = salesByYear
    .slice()
    .sort((a, b) => b.month - a.month)
    .map(row => {
      const pct = (row.goal_clients ?? 0) > 0
        ? Math.min(((row.signed_clients ?? 0) / (row.goal_clients ?? 1)) * 100, 100)
        : 0;
      return { ...row, pct };
    });

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sales Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{year} YTD performance</p>
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
            { label: "Total Signed YTD", value: ytdSigned, sub: `Goal: ${ytdGoal}`, color: TEAL, icon: <Users size={16} /> },
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
          <h2 className="text-sm font-semibold text-foreground mb-4">{year} — Monthly Signed vs Goal</h2>
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
              <Bar dataKey="Goal" fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Referrals" fill={AMBER} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Breakdown Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Monthly Breakdown</h2>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : monthlyRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No sales data for {year}.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs text-muted-foreground font-medium">Month</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Goal</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Signed</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Referrals</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Outbound</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground font-medium">Achievement</th>
                  <th className="px-5 py-3 text-xs text-muted-foreground font-medium w-32">Progress</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map(row => (
                  <tr key={row.month} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-5 py-3 font-medium text-foreground">{MONTHS_LONG[row.month - 1]}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{row.goal_clients ?? 0}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: TEAL }}>{row.signed_clients ?? 0}</td>
                    <td className="px-5 py-3 text-right" style={{ color: GREEN }}>{row.referral_count ?? 0}</td>
                    <td className="px-5 py-3 text-right" style={{ color: AMBER }}>{row.outbound_count ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs font-medium" style={{ color: row.pct >= 100 ? GREEN : row.pct >= 75 ? TEAL : MUTED_FG }}>
                        {fmtPct(row.pct)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-1.5 rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.pct >= 100 ? GREEN : TEAL }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-5 py-3 font-semibold text-foreground text-xs uppercase tracking-wider">YTD Total</td>
                  <td className="px-5 py-3 text-right font-semibold text-foreground">{ytdGoal}</td>
                  <td className="px-5 py-3 text-right font-bold" style={{ color: TEAL }}>{ytdSigned}</td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: GREEN }}>{ytdReferrals}</td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: AMBER }}>{ytdOutbound}</td>
                  <td className="px-5 py-3 text-right font-bold" style={{ color: ytdAchievement >= 100 ? GREEN : TEAL }}>
                    {fmtPct(ytdAchievement)}
                  </td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
