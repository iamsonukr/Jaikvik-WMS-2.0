'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, StatCard, Card, CardHeader, Spinner, Badge } from '@/components/ui';
import { Building2, Tags, Receipt, ScrollText, ArrowRight, Wallet as WalletIcon, TrendingUp, IndianRupee } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '@/lib/api';

const quickLinks = [
  { href: '/tenants', label: 'Manage clients', icon: Building2, desc: 'Onboard, activate, suspend, and assign plans.' },
  { href: '/plans', label: 'Manage plans', icon: Tags, desc: 'Edit pricing, features, and limits per plan.' },
  { href: '/pricing', label: 'Message pricing', icon: Receipt, desc: 'Configure per-category, per-country pricing.' },
  { href: '/audit-logs', label: 'Audit logs', icon: ScrollText, desc: 'Review staff actions across the platform.' },
];

const STATUS_COLORS = { active: '#25D366', suspended: '#f59e0b', disabled: '#ef4444' };

function fmtInr(n) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
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

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Admin dashboard" subtitle="Platform-wide client and billing management." />

      {!tenants ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <StatCard label="Total clients" value={tenants.length} icon={Building2} color="#25D366" />
          <StatCard label="Recharge revenue (month)" value={fmtInr(summary?.rechargeRevenue?.month)} icon={TrendingUp} color="#3b82f6" />
          <StatCard label="Message revenue (month)" value={fmtInr(summary?.messageRevenue?.month)} icon={IndianRupee} color="#f59e0b" />
        </div>
      )}

      {error && (
        <p className="mb-6 text-sm text-muted-foreground">
          Revenue charts are temporarily unavailable — the wallet summary endpoint didn't respond.
        </p>
      )}

      {summary && (
        <div className="grid gap-5 lg:grid-cols-3 mb-6">
          <Card className="p-5 lg:col-span-2">
            <CardHeader title="Revenue — last 14 days" subtitle="Wallet recharges vs. message spend" />
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.dailySeries}>
                  <defs>
                    <linearGradient id="recharge" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25D366" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtInr(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="recharge" name="Recharge" stroke="#25D366" fill="url(#recharge)" strokeWidth={2} />
                  <Area type="monotone" dataKey="spend" name="Message spend" stroke="#3b82f6" fill="url(#spend)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Clients by status" />
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {statusBreakdown.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid gap-5 lg:grid-cols-2 mb-8">
          <Card className="p-5">
            <CardHeader title="Top clients by spend" />
            {!summary.topClients?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No spend recorded yet.</p>
            ) : (
              <div className="h-56 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.topClients} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v) => fmtInr(v)} />
                    <Bar dataKey="totalSpent" name="Lifetime spend" fill="#25D366" radius={[0, 6, 6, 0]} />
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
