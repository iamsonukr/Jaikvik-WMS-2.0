'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Card, PageHeader, StatusBadge, Spinner, Button } from '@/components/ui';
import api from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

export default function BroadcastDetailPage() {
  const { id } = useParams();
  const [broadcast, setBroadcast] = useState(null);
  const [logs,      setLogs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const load = () => {
    Promise.all([
      api.get(`/broadcasts/${id}`),
      api.get(`/broadcasts/${id}/logs`),
    ]).then(([b, l]) => { setBroadcast(b.data); setLogs(l.data); setError(''); })
      .catch(() => setError('Could not load this campaign. It may have been deleted.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // Auto-refresh while the broadcast is actively sending
  useEffect(() => {
    if (broadcast?.status !== 'running') return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [broadcast?.status, id]);

  if (loading) return <AppShell allowedRoles={['admin', 'master']}><div className="flex justify-center py-20"><Spinner size={32} /></div></AppShell>;

  if (error) {
    return (
      <AppShell allowedRoles={['admin', 'master']}>
        <div className="mb-6"><Link href="/master/broadcasts"><Button variant="ghost" size="sm"><ArrowLeft size={14}/>Back</Button></Link></div>
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>
      </AppShell>
    );
  }

  const pct = (n) => broadcast?.sentCount > 0 ? Math.round((n / broadcast.sentCount) * 100) : 0;

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/master/broadcasts"><Button variant="ghost" size="sm"><ArrowLeft size={14}/>Back</Button></Link>
        <div>
          <h1 className="text-xl font-bold">{broadcast?.name}</h1>
          <p className="text-sm text-[var(--muted-text)]">Template: {broadcast?.templateName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={broadcast?.status} />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw size={13}/>Refresh</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total',     val: broadcast?.totalCount,     color: '#6b7280' },
          { label: 'Sent',      val: broadcast?.sentCount,      color: '#6366f1' },
          { label: 'Delivered', val: broadcast?.deliveredCount, color: '#22c55e', pct: pct(broadcast?.deliveredCount) },
          { label: 'Read',      val: broadcast?.readCount,      color: '#f59e0b', pct: pct(broadcast?.readCount) },
          { label: 'Failed',    val: broadcast?.failedCount,    color: '#ef4444' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-[var(--muted-text)]">{s.label}</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: s.color }}>{s.val ?? 0}</p>
            {s.pct != null && <p className="text-xs text-[var(--muted-text)]">{s.pct}%</p>}
          </Card>
        ))}
      </div>

      {/* Logs table */}
      <Card>
        <div className="px-5 py-4 border-b border-[var(--dark-border)] flex items-center justify-between">
          <h3 className="font-semibold text-sm">Message Logs</h3>
          <span className="text-xs text-[var(--muted-text)]">{logs.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--dark-border)]">
                {['Contact','Phone','Status','WA Message ID','Error'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-text)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--dark-border)]">
              {logs.map(l => (
                <tr key={l._id} className="table-row-hover">
                  <td className="px-4 py-2.5">{l.contactName || '—'}</td>
                  <td className="px-4 py-2.5 text-[var(--muted-text)]">{l.phone}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-[var(--muted-text)] font-mono">{l.waMessageId || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-red-500">{l.errorMessage || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-[var(--muted-text)]">No logs yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
