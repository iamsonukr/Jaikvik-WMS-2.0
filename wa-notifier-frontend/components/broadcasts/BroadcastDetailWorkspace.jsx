'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Download, Pause, RefreshCw, Send, XCircle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Input, PageHeader, Select, Spinner, StatusBadge, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();

export default function BroadcastDetailWorkspace({ allowedRoles, basePath }) {
  const { id } = useParams();
  const router = useRouter();
  const [broadcast, setBroadcast] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'contact', direction: 'asc' });
  const [testPhone, setTestPhone] = useState('');
  const [actioning, setActioning] = useState('');

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

  const runAction = async (action, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setActioning(action);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/broadcasts/${id}/${action}`);
      if (action === 'duplicate') {
        router.push(`${basePath}/broadcasts/${data._id}`);
        return;
      }
      if (action !== 'send') setBroadcast(data);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || `Could not ${action} this campaign.`);
    } finally {
      setActioning('');
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) { setError('Enter a test WhatsApp number.'); return; }
    setActioning('test');
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/broadcasts/${id}/test`, { phone: testPhone.trim() });
      setNotice(data?.waMessageId ? `Test sent. Message ID: ${data.waMessageId}` : 'Test sent.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not send the test message.');
    } finally {
      setActioning('');
    }
  };

  const exportLogs = async () => {
    setActioning('export');
    setError('');
    try {
      const res = await api.get(`/broadcasts/${id}/logs/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      const disposition = res.headers?.['content-disposition'] || '';
      const filename = disposition.match(/filename="(.+)"/)?.[1] || `${broadcast?.name || 'broadcast'}_logs.csv`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not export logs.');
    } finally {
      setActioning('');
    }
  };

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

  const sortedLogs = useMemo(() => sortItems(filteredLogs, sort, {
    contact: (log) => log.contactName,
    phone: (log) => log.phone,
    status: (log) => log.status,
    messageId: (log) => log.waMessageId,
    errorCode: (log) => log.errorCode || log.errorSubcode,
    reason: (log) => log.errorMessage,
  }), [filteredLogs, sort]);
  const logsPage = usePagination(sortedLogs, {
    initialPageSize: 25,
    resetKey: `${search}|${statusFilter}|${sort.key}|${sort.direction}`,
  });

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
          {['draft', 'paused', 'scheduled', 'failed'].includes(broadcast?.status) && (
            <Button variant="outline" size="sm" onClick={() => runAction('send')} disabled={actioning === 'send'}><Send size={13} />Send</Button>
          )}
          {broadcast?.status === 'running' && (
            <Button variant="outline" size="sm" onClick={() => runAction('pause')} disabled={actioning === 'pause'}><Pause size={13} />Pause</Button>
          )}
          {['draft', 'scheduled', 'running', 'paused'].includes(broadcast?.status) && (
            <Button variant="outline" size="sm" onClick={() => runAction('cancel', 'Cancel this campaign? Unsent messages will not be delivered.')} disabled={actioning === 'cancel'}><XCircle size={13} />Cancel</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => runAction('duplicate')} disabled={actioning === 'duplicate'}><Copy size={13} />Duplicate</Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw size={13} />Refresh</Button>
        </div>
      </div>

      {notice && <div className="soft-alert mb-5 border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300">{notice}</div>}
      {error && <div className="soft-alert mb-5 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        {[
          { label: 'Total', val: broadcast?.totalCount, color: '#6b7280' },
          { label: 'Sent', val: broadcast?.sentCount, color: '#6366f1' },
          { label: 'Delivered', val: broadcast?.deliveredCount, color: '#22c55e', pct: pct(broadcast?.deliveredCount) },
          { label: 'Read', val: broadcast?.readCount, color: '#f59e0b', pct: pct(broadcast?.readCount) },
          { label: 'Failed', val: broadcast?.failedCount, color: '#ef4444' },
          { label: 'Canceled', val: broadcast?.canceledCount, color: '#94a3b8' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-2xl font-bold" style={{ color: s.color }}>{s.val ?? 0}</p>
            {s.pct != null && <p className="text-xs text-muted-foreground">{s.pct}%</p>}
          </Card>
        ))}
      </div>

      <Card className="mb-6 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input placeholder="Test WhatsApp number..." value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
          <Button variant="outline" onClick={sendTest} disabled={actioning === 'test'}><Send size={14} />Send Test</Button>
          <Button variant="outline" onClick={exportLogs} disabled={actioning === 'export'}><Download size={14} />Export Logs</Button>
        </div>
      </Card>

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
                <SortableTh label="Contact" sortKey="contact" sort={sort} onSort={setSort} />
                <SortableTh label="Phone" sortKey="phone" sort={sort} onSort={setSort} />
                <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                <SortableTh label="WA Message ID" sortKey="messageId" sort={sort} onSort={setSort} />
                <SortableTh label="Error Code" sortKey="errorCode" sort={sort} onSort={setSort} />
                <SortableTh label="Failure Reason" sortKey="reason" sort={sort} onSort={setSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logsPage.pageItems.map((log) => (
                <tr key={log._id} className="table-row-hover">
                  <td className="px-4 py-2.5">{log.contactName || '-'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{log.phone || '-'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={log.status} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{log.waMessageId || '-'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{log.errorCode || log.errorSubcode ? [log.errorCode, log.errorSubcode].filter(Boolean).join('/') : '-'}</td>
                  <td className="max-w-[320px] px-4 py-2.5 text-xs text-red-500">{log.errorMessage || '-'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No logs match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls {...logsPage} onPageChange={logsPage.setPage} onPageSizeChange={logsPage.setPageSize} />
      </Card>
    </AppShell>
  );
}
