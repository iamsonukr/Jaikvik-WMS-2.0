'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Input, PageHeader, Select, Spinner, StatusBadge } from '@/components/ui';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();

export default function BroadcastDetailWorkspace({ allowedRoles, basePath }) {
  const { id } = useParams();
  const [broadcast, setBroadcast] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    Promise.all([
      api.get(`/broadcasts/${id}`),
      api.get(`/broadcasts/${id}/logs`),
    ]).then(([b, l]) => { setBroadcast(b.data); setLogs(l.data); setError(''); })
      .catch(() => setError('Could not load this campaign. It may have been deleted.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (broadcast?.status !== 'running') return undefined;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [broadcast?.status, id]);

  const statusOptions = useMemo(() => {
    const values = logs.map((log) => log.status).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = text(search.trim());
    return logs.filter((log) => {
      const matchesSearch = !query
        || text(log.contactName).includes(query)
        || text(log.phone).includes(query)
        || text(log.status).includes(query)
        || text(log.waMessageId).includes(query)
        || text(log.errorMessage).includes(query);
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [logs, search, statusFilter]);

  if (loading) return <AppShell allowedRoles={allowedRoles}><div className="flex justify-center py-20"><Spinner size={32} /></div></AppShell>;

  if (error) {
    return (
      <AppShell allowedRoles={allowedRoles}>
        <div className="mb-6"><Link href={`${basePath}/broadcasts`}><Button variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button></Link></div>
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>
      </AppShell>
    );
  }

  const pct = (n) => broadcast?.sentCount > 0 ? Math.round((n / broadcast.sentCount) * 100) : 0;

  return (
    <AppShell allowedRoles={allowedRoles}>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`${basePath}/broadcasts`}><Button variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button></Link>
        <div>
          <h1 className="text-xl font-bold">{broadcast?.name}</h1>
          <p className="text-sm text-muted-foreground">Template: {broadcast?.templateName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={broadcast?.status} />
          <Button variant="outline" size="sm" onClick={load}><RefreshCw size={13} />Refresh</Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: 'Total', val: broadcast?.totalCount, color: '#6b7280' },
          { label: 'Sent', val: broadcast?.sentCount, color: '#6366f1' },
          { label: 'Delivered', val: broadcast?.deliveredCount, color: '#22c55e', pct: pct(broadcast?.deliveredCount) },
          { label: 'Read', val: broadcast?.readCount, color: '#f59e0b', pct: pct(broadcast?.readCount) },
          { label: 'Failed', val: broadcast?.failedCount, color: '#ef4444' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-2xl font-bold" style={{ color: s.color }}>{s.val ?? 0}</p>
            {s.pct != null && <p className="text-xs text-muted-foreground">{s.pct}%</p>}
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px_auto]">
          <Input placeholder="Search contact, phone, message id, error..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
          <div className="flex items-center justify-end text-xs text-muted-foreground">{filteredLogs.length} of {logs.length} records</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {['Contact', 'Phone', 'Status', 'WA Message ID', 'Error'].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.map((log) => (
                <tr key={log._id} className="table-row-hover">
                  <td className="px-4 py-2.5">{log.contactName || '-'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{log.phone || '-'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={log.status} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{log.waMessageId || '-'}</td>
                  <td className="px-4 py-2.5 text-xs text-red-500">{log.errorMessage || '-'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">No logs match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
