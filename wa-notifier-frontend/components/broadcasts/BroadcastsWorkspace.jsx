'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Copy, Eye as EyeIcon, Megaphone, Pause, Plus, Send, XCircle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Empty, Input, PageHeader, Select, Spinner, StatusBadge, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();

export default function BroadcastsWorkspace({ allowedRoles, basePath }) {
  const { activeClient } = useClient();
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState({});
  const [sendError, setSendError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'createdAt', direction: 'desc' });
  const pollRefs = useRef({});

  const load = () => {
    if (!activeClient) { setBroadcasts([]); return; }
    setLoading(true);
    api.get(`/broadcasts?whatsappAccountId=${activeClient._id}`)
      .then((r) => setBroadcasts(r.data))
      .catch(() => setBroadcasts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeClient]);

  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
      pollRefs.current = {};
    };
  }, [activeClient]);

  const send = async (id) => {
    if (!confirm('Start or resume sending this broadcast now?')) return;
    setSendError('');
    setSending((prev) => ({ ...prev, [id]: true }));
    try {
      await api.post(`/broadcasts/${id}/send`);
      setBroadcasts((prev) => prev.map((b) => b._id === id ? { ...b, status: 'running' } : b));
      const poll = setInterval(async () => {
        try {
          const { data } = await api.get(`/broadcasts/${id}`);
          setBroadcasts((prev) => prev.map((b) => b._id === id ? data : b));
          if (['done', 'failed', 'paused', 'canceled'].includes(data.status)) {
            clearInterval(poll);
            delete pollRefs.current[id];
            setSending((prev) => ({ ...prev, [id]: false }));
          }
        } catch {
          clearInterval(poll);
          delete pollRefs.current[id];
          setSending((prev) => ({ ...prev, [id]: false }));
        }
      }, 3000);
      pollRefs.current[id] = poll;
    } catch (err) {
      setSendError(err?.response?.data?.message || 'Could not start the broadcast. It may already be running.');
      setSending((prev) => ({ ...prev, [id]: false }));
      load();
    }
  };

  const runAction = async (id, action, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setSendError('');
    setSending((prev) => ({ ...prev, [`${id}:${action}`]: true }));
    try {
      const { data } = await api.post(`/broadcasts/${id}/${action}`);
      if (action === 'duplicate') {
        setBroadcasts((prev) => [data, ...prev]);
      } else {
        setBroadcasts((prev) => prev.map((b) => b._id === id ? data : b));
      }
    } catch (err) {
      setSendError(err?.response?.data?.message || `Could not ${action} this campaign.`);
    } finally {
      setSending((prev) => ({ ...prev, [`${id}:${action}`]: false }));
    }
  };

  const templateOptions = useMemo(() => {
    const names = broadcasts.map((b) => b.templateName).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [broadcasts]);

  const filteredBroadcasts = useMemo(() => {
    const query = text(search.trim());
    return broadcasts.filter((b) => {
      const matchesSearch = !query
        || text(b.name).includes(query)
        || text(b.templateName).includes(query)
        || text(b.status).includes(query)
        || text(b._id).includes(query);
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesTemplate = templateFilter === 'all' || b.templateName === templateFilter;
      return matchesSearch && matchesStatus && matchesTemplate;
    });
  }, [broadcasts, search, statusFilter, templateFilter]);

  const sortedBroadcasts = useMemo(() => sortItems(filteredBroadcasts, sort, {
    campaign: (b) => b.name,
    template: (b) => b.templateName,
    status: (b) => b.status,
    schedule: (b) => b.scheduledAt,
    total: (b) => b.totalCount ?? 0,
    sent: (b) => b.sentCount ?? 0,
    delivered: (b) => b.deliveredCount ?? 0,
    read: (b) => b.readCount ?? 0,
    failed: (b) => b.failedCount ?? 0,
    createdAt: (b) => b.createdAt,
  }), [filteredBroadcasts, sort]);
  const broadcastsPage = usePagination(sortedBroadcasts, {
    initialPageSize: 10,
    resetKey: `${search}|${statusFilter}|${templateFilter}|${sort.key}|${sort.direction}`,
  });

  const pct = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : '-';

  return (
    <AppShell allowedRoles={allowedRoles}>
      <PageHeader
        title="Broadcasts"
        subtitle="Bulk WhatsApp campaigns"
        action={<Link href={`${basePath}/broadcasts/new`}><Button><Plus size={15} />New Campaign</Button></Link>}
      />

      {sendError && (
        <div className="soft-alert mb-5 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{sendError}</div>
      )}

      {loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!loading && broadcasts.length === 0 && (
        <Empty icon={Megaphone} title="No campaigns yet" description="Create a broadcast to start sending template messages to your contacts." action={<Link href={`${basePath}/broadcasts/new`}><Button><Plus size={14} />New Campaign</Button></Link>} />
      )}

      {!loading && broadcasts.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_160px_220px]">
            <Input placeholder="Search campaign, template, status..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
            </Select>
            <Select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
              <option value="all">All templates</option>
              {templateOptions.map((template) => <option key={template} value={template}>{template}</option>)}
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Campaign" sortKey="campaign" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Template" sortKey="template" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Schedule" sortKey="schedule" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Total" sortKey="total" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Sent" sortKey="sent" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Delivered" sortKey="delivered" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Read" sortKey="read" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Failed" sortKey="failed" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <SortableTh label="Created" sortKey="createdAt" sort={sort} onSort={setSort} className="whitespace-nowrap" />
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredBroadcasts.length && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">No campaigns match these filters.</td></tr>
                )}
                {broadcastsPage.pageItems.map((b) => (
                  <tr key={b._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="max-w-[180px] truncate font-medium">{b.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{b._id}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{b.templateName || '-'}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{b.scheduledAt ? format(new Date(b.scheduledAt), 'dd MMM, HH:mm') : '-'}</td>
                    <td className="px-4 py-3">{b.totalCount ?? 0}</td>
                    <td className="px-4 py-3">{b.sentCount ?? 0}</td>
                    <td className="px-4 py-3 text-green-600">{b.deliveredCount ?? 0} <span className="text-xs text-muted-foreground">({pct(b.deliveredCount, b.sentCount)})</span></td>
                    <td className="px-4 py-3 text-yellow-600">{b.readCount ?? 0} <span className="text-xs text-muted-foreground">({pct(b.readCount, b.sentCount)})</span></td>
                    <td className="px-4 py-3 text-red-500">{b.failedCount ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{b.createdAt ? format(new Date(b.createdAt), 'dd MMM, HH:mm') : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {['draft', 'paused', 'scheduled', 'failed'].includes(b.status) && (
                          <Button size="sm" onClick={() => send(b._id)} disabled={sending[b._id]}>
                            <Send size={12} />{sending[b._id] ? 'Sending...' : 'Send'}
                          </Button>
                        )}
                        {b.status === 'running' && (
                          <Button size="sm" variant="outline" onClick={() => runAction(b._id, 'pause')} disabled={sending[`${b._id}:pause`]}>
                            <Pause size={12} />Pause
                          </Button>
                        )}
                        {['draft', 'scheduled', 'running', 'paused'].includes(b.status) && (
                          <Button size="sm" variant="outline" onClick={() => runAction(b._id, 'cancel', 'Cancel this campaign? Unsent messages will not be delivered.')}>
                            <XCircle size={12} />Cancel
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => runAction(b._id, 'duplicate')}>
                          <Copy size={12} />Duplicate
                        </Button>
                        <Link href={`${basePath}/broadcasts/${b._id}`}><Button size="sm" variant="ghost"><EyeIcon size={12} />Logs</Button></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls {...broadcastsPage} onPageChange={broadcastsPage.setPage} onPageSizeChange={broadcastsPage.setPageSize} />
        </Card>
      )}
    </AppShell>
  );
}
