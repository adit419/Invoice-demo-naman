import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { withAuthGuard } from '@/components/AuthGuard';
import {
  LayoutDashboard, Briefcase, BarChart3, TrendingUp,
  DollarSign, AlertCircle, Clock, TrendingDown,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import { TotalARModal } from '@/components/ar/TotalARModal';
import { PastDueARModal } from '@/components/ar/PastDueARModal';
import { DSOModal } from '@/components/ar/DSOModal';
import { ARForecast } from '@/components/ar/ARForecast';
import { CollectionsWorkbench } from '@/components/ar/CollectionsWorkbench';
import { CustomerInsights } from '@/components/ar/CustomerInsights';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'workbench' | 'insights' | 'forecast';

// ── Data (exact from Figma source) ────────────────────────────────────────────

const agingData = [
  { bucket: 'Current', amount: 1765000, color: '#10b981' },
  { bucket: '1-30',    amount: 425000,  color: '#fbbf24' },
  { bucket: '31-60',   amount: 165000,  color: '#f97316' },
  { bucket: '61-90',   amount: 65000,   color: '#ef4444' },
  { bucket: '90+',     amount: 30000,   color: '#dc2626' },
];

const dsoTrendData = [
  { month: 'Jun', dso: 48 },
  { month: 'Jul', dso: 47 },
  { month: 'Aug', dso: 45 },
  { month: 'Sep', dso: 44 },
  { month: 'Oct', dso: 43 },
  { month: 'Nov', dso: 42 },
];

const topOverdueCustomers = [
  { name: 'ABC Manufacturing Ltd', amount: 145000, days: 67, risk: 'high'   },
  { name: 'Global Retail Corp',    amount: 98000,  days: 45, risk: 'medium' },
  { name: 'Tech Solutions Inc',    amount: 87000,  days: 52, risk: 'medium' },
  { name: 'Premium Distributors',  amount: 76000,  days: 89, risk: 'high'   },
  { name: 'Smart Systems Co',      amount: 65000,  days: 38, risk: 'low'    },
];

const totalAR   = agingData.reduce((s, d) => s + d.amount, 0); // 2,450,000
const pastDueAR = agingData.filter(d => d.bucket !== 'Current').reduce((s, d) => s + d.amount, 0); // 685,000

// ── Navigation tabs ───────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'AR Dashboard',          Icon: LayoutDashboard },
  { id: 'workbench', label: 'Collections Workbench', Icon: Briefcase       },
  { id: 'insights',  label: 'Customer Insights',     Icon: BarChart3       },
  { id: 'forecast',  label: 'AR Forecast',           Icon: TrendingUp      },
];

// ── AR Dashboard Tab ──────────────────────────────────────────────────────────

function ARDashboard() {
  const [activeModal, setActiveModal] = useState<'totalAR' | 'pastDueAR' | 'dso' | null>(null);

  const kpiData = [
    {
      label: 'Total AR',
      value: `$${(totalAR / 1_000_000).toFixed(2)}M`,
      change: '+5.2%',
      trend: 'up' as const,
      Icon: DollarSign,
      colorClass: 'bg-blue-50',
      iconClass: 'text-blue-600',
      trendClass: 'text-blue-600',
      modal: 'totalAR' as const,
    },
    {
      label: 'Past Due AR',
      value: `$${(pastDueAR / 1_000_000).toFixed(2)}M`,
      change: '-8.3%',
      trend: 'down' as const,
      Icon: AlertCircle,
      colorClass: 'bg-red-50',
      iconClass: 'text-red-500',
      trendClass: 'text-green-600',
      modal: 'pastDueAR' as const,
    },
    {
      label: 'DSO',
      value: '42 days',
      change: '-3 days',
      trend: 'down' as const,
      Icon: Clock,
      colorClass: 'bg-green-50',
      iconClass: 'text-green-600',
      trendClass: 'text-green-600',
      modal: 'dso' as const,
    },
    {
      label: 'Past Due %',
      value: '28%',
      change: '-4.1%',
      trend: 'down' as const,
      Icon: TrendingDown,
      colorClass: 'bg-amber-50',
      iconClass: 'text-amber-600',
      trendClass: 'text-green-600',
      modal: null,
    },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">AR Analytics Dashboard</h1>
        <div className="text-right">
          <p className="text-sm text-slate-500">Last Updated</p>
          <p className="text-slate-900 font-medium">Nov 25, 2024 • 9:30 AM</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi) => {
          const TrendIcon = kpi.trend === 'up' ? ArrowUpRight : ArrowDownRight;
          return (
            <div
              key={kpi.label}
              onClick={() => kpi.modal && setActiveModal(kpi.modal)}
              className={`bg-white rounded-xl p-6 shadow-sm border border-slate-200 ${
                kpi.modal ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-slate-600 text-sm">{kpi.label}</p>
                  <p className="text-slate-900 text-2xl font-bold mt-2">{kpi.value}</p>
                  <div className={`flex items-center gap-1 mt-2 ${kpi.trendClass}`}>
                    <TrendIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{kpi.change}</span>
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-lg ${kpi.colorClass} flex items-center justify-center`}>
                  <kpi.Icon className={`w-6 h-6 ${kpi.iconClass}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* AR Aging Analysis */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-slate-900 font-semibold mb-4">AR Aging Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `$${((v as number) / 1000).toFixed(0)}K`}
              />
              <Tooltip
                formatter={(v: unknown) => [`$${((v as number) / 1000).toFixed(0)}K`, 'Amount']}
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                {agingData.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* DSO Trend */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-slate-900 font-semibold mb-4">DSO Trend (6 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dsoTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: unknown) => [`${v as number} days`, 'DSO']}
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Line
                type="monotone"
                dataKey="dso"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Overdue Customers */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-slate-900 font-semibold mb-4">Top Overdue Customers</h3>
        <div className="space-y-3">
          {topOverdueCustomers.map((c) => (
            <div key={c.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <p className="text-slate-900 font-medium">{c.name}</p>
                <p className="text-sm text-slate-500">{c.days} days overdue</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-slate-900 font-semibold">${(c.amount / 1000).toFixed(0)}K</p>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  c.risk === 'high'   ? 'bg-red-100 text-red-700'   :
                  c.risk === 'medium' ? 'bg-amber-100 text-amber-700' :
                                        'bg-green-100 text-green-700'
                }`}>
                  {c.risk}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
          <p className="text-slate-600 text-sm">Unapplied Cash (This Week)</p>
          <p className="text-slate-900 text-2xl font-bold mt-2">$28,500</p>
          <p className="text-xs text-slate-500 mt-1">3 transactions pending</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
          <p className="text-slate-600 text-sm">Analyst Hours Saved</p>
          <p className="text-slate-900 text-2xl font-bold mt-2">48 hrs/week</p>
          <p className="text-xs text-slate-500 mt-1">via automation</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-100">
          <p className="text-slate-600 text-sm">TDS Mismatches Detected</p>
          <p className="text-slate-900 text-2xl font-bold mt-2">3 items</p>
          <p className="text-xs text-slate-500 mt-1">require review</p>
        </div>
      </div>

      {/* Modals */}
      {activeModal === 'totalAR'   && <TotalARModal   onClose={() => setActiveModal(null)} />}
      {activeModal === 'pastDueAR' && <PastDueARModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'dso'       && <DSOModal       onClose={() => setActiveModal(null)} />}
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

// Maps ar_sub_access keys (from user management) → tab IDs used in this page
const AR_SUB_TO_TAB: Record<string, TabId> = {
  arDashboard:          'dashboard',
  collectionsWorkbench: 'workbench',
  customerInsights:     'insights',
  arForecastTab:        'forecast',
};

function ForecastingPage() {
  const { user } = useAuth();

  // Admins see every tab; non-admins see only what ar_sub_access permits.
  // Empty ar_sub_access = no restriction → show all tabs.
  const visibleTabs = useMemo(() => {
    if (!user || user.role === 'admin') return TABS;
    const sub = user.ar_sub_access ?? [];
    if (sub.length === 0) return TABS;
    const allowed = new Set(sub.map(k => AR_SUB_TO_TAB[k]).filter(Boolean));
    return TABS.filter(t => allowed.has(t.id));
  }, [user]);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (!user || user.role === 'admin') return 'dashboard';
    const sub = user.ar_sub_access ?? [];
    if (sub.length === 0) return 'dashboard';
    const allowed = sub.map(k => AR_SUB_TO_TAB[k]).filter(Boolean);
    return (allowed[0] as TabId | undefined) ?? 'dashboard';
  });

  // If the active tab is no longer visible (e.g. permissions changed), reset
  const safeTab = visibleTabs.find(t => t.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id ?? 'dashboard');

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "Inter, sans-serif" }}>

      {/* Greeting bar */}
      <div style={{ padding: "12px 32px", borderBottom: "1px solid #E6E6E6" }}>
        <p style={{ margin: 0, fontSize: 14, color: "#414651", fontWeight: 500 }}>AR Analytics</p>
      </div>

      {/* Title + tab bar */}
      <div style={{ padding: "20px 32px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#101828", letterSpacing: "-0.5px", fontFamily: "Inter, sans-serif" }}>
            Invoice Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#717680", fontFamily: "Inter, sans-serif" }}>
            Order-to-Cash Automation
          </p>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #E6E6E6" }}>
            {visibleTabs.map(({ id, label, Icon }) => {
              const active = safeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 16px",
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    color: active ? "#1876FF" : "#717680",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: active ? "2px solid #1876FF" : "2px solid transparent",
                    marginBottom: -1, fontFamily: "Inter, sans-serif",
                    transition: "color 0.15s", whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#414651"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#717680"; }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 32px" }}>
        {safeTab === 'dashboard' && <ARDashboard />}
        {safeTab === 'workbench' && <CollectionsWorkbench />}
        {safeTab === 'insights'  && <CustomerInsights />}
        {safeTab === 'forecast'  && <ARForecast />}
      </div>
    </div>
  );
}

export default withAuthGuard(ForecastingPage);
