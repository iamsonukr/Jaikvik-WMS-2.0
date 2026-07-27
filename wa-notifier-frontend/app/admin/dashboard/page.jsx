'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, StatCard, Card, CardHeader, Spinner, Badge } from '@/components/ui';
import { Building2, Tags, ScrollText, ArrowRight, TrendingUp, IndianRupee } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '@/lib/api';

const quickLinks = [
  { href: '/tenants', label: 'Manage clients', icon: Building2, desc: 'Onboard, activate, suspend, and assign plans.' },
  { href: '/plans', label: 'Manage plans', icon: Tags, desc: 'Edit pricing, message rates, features, and limits per plan.' },
  { href: '/audit-logs', label: 'Audit logs', icon: ScrollText, desc: 'Review staff actions across the platform.' },
];

const STATUS_COLORS = { active: '#22c55e', suspended: '#f59e0b', disabled: '#ef4444' };
const CHART = {
  recharge: '#16a34a',
  spend: '#2563eb',
};

function fmtInr(n) {
  return `INR ${(n || 0).toLocaleString('en-IN')}`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const formatValue = (item) => (
    ['active', 'suspended', 'disabled'].includes(String(item.name).toLowerCase())
      ? item.value
      : typeof item.value === 'number'
        ? fmtInr(item.value)
        : item.value
  );
  return (
    <div className="chart-tooltip">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey || item.name} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className="font-medium text-foreground">{formatValue(item)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [tenants, setTenants] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/tenants').then((res) => setTenants(res.data));
    api.get('/wallet/admin/summary').then((res) => setSummary(res.data)).catch(() => setError(true));
  }, []);

  const statusBreakdown = tenants
    ? ['active', 'suspended', 'disabled'].map((status) => ({
        name: status,
        value: tenants.filter((t) => t.status === status).length,
      })).filter((s) => s.value > 0)
    : [];
  const activeTenants = tenants?.filter((t) => t.status === 'active').length || 0;
  const suspendedTenants = tenants?.filter((t) => t.status === 'suspended').length || 0;

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Admin dashboard" subtitle="Platform-wide client, revenue, and account health." />

      {!tenants ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total clients" value={tenants.length} icon={Building2} color="#25D366" />
          <StatCard label="Active clients" value={activeTenants} icon={TrendingUp} color="#2563eb" sub={`${suspendedTenants} suspended`} />
          <StatCard label="Recharge revenue" value={fmtInr(summary?.rechargeRevenue?.month)} icon={TrendingUp} color="#8b5cf6" sub="This month" />
          <StatCard label="Message revenue" value={fmtInr(summary?.messageRevenue?.month)} icon={IndianRupee} color="#f59e0b" sub="This month" />
        </div>
      )}

      {error && (
        <p className="mb-6 text-sm text-muted-foreground">
          Revenue charts are temporarily unavailable — the wallet summary endpoint didn't respond.
        </p>
      )}

      {summary && (
        <div className="grid gap-5 lg:grid-cols-3 mb-6">
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader title="Revenue — last 14 days" subtitle="Wallet recharges vs. message spend" />
            <div className="h-72 p-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.dailySeries}>
                  <defs>
                    <linearGradient id="recharge" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART.recharge} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={CHART.recharge} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART.spend} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART.spend} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} opacity={0.7} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
                  <Legend iconType="circle" iconSize={8} />
                  <Area type="monotone" dataKey="recharge" name="Recharge" stroke={CHART.recharge} fill="url(#recharge)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="spend" name="Message spend" stroke={CHART.spend} fill="url(#spend)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Clients by status" />
            <div className="h-72 p-5">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {statusBreakdown.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid gap-5 lg:grid-cols-2 mb-8">
          <Card className="overflow-hidden">
            <CardHeader title="Top clients by spend" />
            {!summary.topClients?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No spend recorded yet.</p>
            ) : (
              <div className="h-64 p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.topClients} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" horizontal={false} opacity={0.7} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="totalSpent" name="Lifetime spend" fill={CHART.recharge} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader title="Revenue at a glance" />
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Recharge revenue (today)</span>
                <span className="font-semibold">{fmtInr(summary.rechargeRevenue.today)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Recharge revenue (year)</span>
                <span className="font-semibold">{fmtInr(summary.rechargeRevenue.year)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Message revenue (year)</span>
                <span className="font-semibold">{fmtInr(summary.messageRevenue.year)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Total refunds issued</span>
                <span className="font-semibold text-red-500">-{fmtInr(summary.refundsTotal)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={`/admin${href}`}>
            <Card className="flex items-center gap-4 p-5 transition-colors hover:bg-accent">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient/10 text-primary">
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
