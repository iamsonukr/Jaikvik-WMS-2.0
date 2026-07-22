'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, CardHeader, StatCard, PageHeader, Spinner } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Users, Send, CheckCheck, Eye, AlertCircle, MessageSquare } from 'lucide-react';

export default function AnalyticsPage() {
  const { activeClient } = useClient();
  const [overview, setOverview] = useState(null);
  const [daily,    setDaily]    = useState([]);
  const [inbox,    setInbox]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (!activeClient) { setOverview(null); setDaily([]); setInbox(null); setError(''); return; }
    const cid = activeClient._id;
    setLoading(true);
    setError('');
    Promise.allSettled([
      api.get(`/analytics/overview?clientId=${cid}`),
      api.get(`/analytics/daily?clientId=${cid}&days=30`),
      api.get(`/analytics/inbox?clientId=${cid}`),
    ]).then(([o, d, i]) => {
      setOverview(o.status === 'fulfilled' ? o.value.data : null);
      setDaily(d.status === 'fulfilled' ? d.value.data : []);
      setInbox(i.status === 'fulfilled' ? i.value.data : null);
      if ([o, d, i].some(result => result.status === 'rejected')) {
        setError('Some analytics data could not be loaded. Please refresh or check the backend logs.');
      }
    }).finally(() => setLoading(false));
  }, [activeClient]);

  if (loading) return <AppShell allowedRoles={['admin', 'master']}><div className="flex justify-center py-20"><Spinner size={32}/></div></AppShell>;

  if (!activeClient) {
    return (
      <AppShell allowedRoles={['admin', 'master']}>
        <PageHeader title="Analytics" subtitle="Performance metrics for the last 30 days" />
        <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          Select a client first to view analytics.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Analytics" subtitle="Performance metrics for the last 30 days" />

      {error && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{error}</div>
      )}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <StatCard label="Contacts"   value={overview.totalContacts}   icon={Users}        color="#25D366" />
          <StatCard label="Campaigns"  value={overview.totalBroadcasts} icon={Send}         color="#6366f1" />
          <StatCard label="Sent"       value={overview.totalSent}       icon={Send}         color="#3b82f6" />
          <StatCard label="Delivered"  value={overview.totalDelivered}  icon={CheckCheck}   color="#22c55e" />
          <StatCard label="Read"       value={overview.totalRead}       icon={Eye}          color="#f59e0b" />
          <StatCard label="Failed"     value={overview.totalFailed}     icon={AlertCircle}  color="#ef4444" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Daily trend */}
        <Card className="lg:col-span-2">
          <CardHeader title="Daily Campaign Performance (30 days)" />
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} barSize={10} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="sent"      fill="#6366f1" name="Sent"      radius={[3,3,0,0]} />
                <Bar dataKey="delivered" fill="#22c55e" name="Delivered" radius={[3,3,0,0]} />
                <Bar dataKey="read"      fill="#f59e0b" name="Read"      radius={[3,3,0,0]} />
                <Bar dataKey="failed"    fill="#ef4444" name="Failed"    radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Inbox stats */}
        {inbox && (
          <Card>
            <CardHeader title="Inbox Overview" />
            <div className="p-5 space-y-4">
              {[
                { label: 'Inbound Messages',  val: inbox.inbound,      color: '#25D366', icon: MessageSquare },
                { label: 'Outbound Messages', val: inbox.outbound,     color: '#6366f1', icon: Send },
                { label: 'Open Threads',      val: inbox.openThreads,  color: '#f59e0b', icon: AlertCircle },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.color + '18' }}>
                    <s.icon size={17} style={{ color: s.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-[var(--muted-text)]">{s.label}</p>
                    <p className="font-bold text-lg">{s.val}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Delivery rate trend */}
      {daily.length > 0 && (
        <Card>
          <CardHeader title="Read Rate Trend" />
          <div className="p-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily.map(d => ({ ...d, readRate: d.sent > 0 ? Math.round((d.read / d.sent) * 100) : 0 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={v => v + '%'} />
                <Line type="monotone" dataKey="readRate" stroke="#f59e0b" strokeWidth={2} dot={false} name="Read Rate" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
