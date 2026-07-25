'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { StatCard, Card, CardHeader, StatusBadge, Spinner, PageHeader, Empty, Button } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import { Users, Send, CheckCheck, Eye, AlertCircle, Megaphone, AlertTriangle, MessageCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DashboardPage() {
  const { activeClient, loading: clientsLoading } = useClient();
  const [stats,  setStats]  = useState(null);
  const [daily,  setDaily]  = useState([]);
  const [recent, setRecent] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeClient) {
      setStats(null); setDaily([]); setRecent([]); setAlerts([]);
      return;
    }
    const cid = activeClient._id;
    setLoading(true);
    Promise.all([
      api.get(`/analytics/overview?clientId=${cid}`),
      api.get(`/analytics/daily?clientId=${cid}&days=14`),
      api.get(`/broadcasts?clientId=${cid}`),
      api.get(`/analytics/alerts?clientId=${cid}`),
    ]).then(([s, d, b, a]) => {
      setStats(s.data);
      setDaily(d.data);
      setRecent(b.data.slice(0, 5));
      setAlerts(a.data);
    }).catch(() => {
      setStats(null); setDaily([]); setRecent([]); setAlerts([]);
    }).finally(() => setLoading(false));
  }, [activeClient]);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Dashboard"
        subtitle={activeClient ? `Overview for ${activeClient.name}` : 'Connect WhatsApp Business to finish setup'}
      />

      {clientsLoading && (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      )}

      {!clientsLoading && !activeClient && (
        <Empty
          icon={MessageCircle}
          title="Connect your WhatsApp Business account"
          description="Use Meta Embedded Signup to link your business number before viewing campaign analytics."
          action={<Link href="/master/connect-whatsapp"><Button><MessageCircle size={15} />Connect WhatsApp</Button></Link>}
        />
      )}

      {activeClient && loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {activeClient && stats && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <StatCard label="Contacts"  value={stats.totalContacts}  icon={Users}      color="#25D366" />
            <StatCard label="Campaigns" value={stats.totalBroadcasts} icon={Megaphone} color="#3b82f6" />
            <StatCard label="Sent"      value={stats.totalSent}      icon={Send}        color="#6366f1" />
            <StatCard label="Delivered" value={stats.totalDelivered} icon={CheckCheck}  color="#22c55e" />
            <StatCard label="Read"      value={stats.totalRead}      icon={Eye}         color="#f59e0b" />
            <StatCard label="Failed"    value={stats.totalFailed}    icon={AlertCircle} color="#ef4444" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Chart */}
            <Card className="lg:col-span-2">
              <CardHeader title="Messages (last 14 days)" />
              <div className="p-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="sent"      stroke="#6366f1" strokeWidth={2} dot={false} name="Sent" />
                    <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} name="Delivered" />
                    <Line type="monotone" dataKey="read"      stroke="#f59e0b" strokeWidth={2} dot={false} name="Read" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Recent broadcasts */}
            <Card>
              <CardHeader title="Recent Campaigns" />
              <div className="divide-y divide-[var(--dark-border)]">
                {recent.length === 0 && <p className="text-sm text-[var(--muted-text)] p-4">No campaigns yet.</p>}
                {recent.map(b => (
                  <div key={b._id} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <p className="text-xs text-[var(--muted-text)]">{b.sentCount} sent</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader title="Recent Account Alerts" />
              <div className="divide-y divide-[var(--dark-border)]">
                {alerts.length === 0 && <p className="text-sm text-[var(--muted-text)] p-4">No account alerts received yet.</p>}
                {alerts.map(alert => (
                  <div key={alert._id} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300">
                      <AlertTriangle size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{alert.type || 'Account alert'}</p>
                        <span className="rounded-full border border-[var(--dark-border)] px-2 py-0.5 text-[11px] text-[var(--muted-text)]">
                          {alert.severity || 'UNKNOWN'}
                        </span>
                        {!alert.clientId && (
                          <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                            test/unmatched
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted-text)]">{alert.description || 'No description provided.'}</p>
                      <p className="mt-1 text-xs text-[var(--muted-text)]">
                        {alert.entityType || 'Entity'} {alert.entityId || 'unknown'}{alert.status ? ` · ${alert.status}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
