'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Eye as EyeIcon, Megaphone, Plus, Send } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Empty, Input, PageHeader, Select, Spinner, StatusBadge } from '@/components/ui';
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
    if (!confirm('Start sending this broadcast now?')) return;
    setSendError('');
    setSending((prev) => ({ ...prev, [id]: true }));
    try {
      await api.post(`/broadcasts/${id}/send`);
      setBroadcasts((prev) => prev.map((b) => b._id === id ? { ...b, status: 'running' } : b));
      const poll = setInterval(async () => {
        try {
          const { data } = await api.get(`/broadcasts/${id}`);
          setBroadcasts((prev) => prev.map((b) => b._id === id ? data : b));
          if (data.status === 'done' || data.status === 'failed') {
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
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
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
                  {['Campaign', 'Template', 'Status', 'Total', 'Sent', 'Delivered', 'Read', 'Failed', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredBroadcasts.length && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No campaigns match these filters.</td></tr>
                )}
                {filteredBroadcasts.map((b) => (
                  <tr key={b._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="max-w-[180px] truncate font-medium">{b.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{b._id}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{b.templateName || '-'}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3">{b.totalCount ?? 0}</td>
                    <td className="px-4 py-3">{b.sentCount ?? 0}</td>
                    <td className="px-4 py-3 text-green-600">{b.deliveredCount ?? 0} <span className="text-xs text-muted-foreground">({pct(b.deliveredCount, b.sentCount)})</span></td>
                    <td className="px-4 py-3 text-yellow-600">{b.readCount ?? 0} <span className="text-xs text-muted-foreground">({pct(b.readCount, b.sentCount)})</span></td>
                    <td className="px-4 py-3 text-red-500">{b.failedCount ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{b.createdAt ? format(new Date(b.createdAt), 'dd MMM, HH:mm') : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {b.status === 'draft' && (
                          <Button size="sm" onClick={() => send(b._id)} disabled={sending[b._id]}>
                            <Send size={12} />{sending[b._id] ? 'Sending...' : 'Send'}
                          </Button>
                        )}
                        <Link href={`${basePath}/broadcasts/${b._id}`}><Button size="sm" variant="ghost"><EyeIcon size={12} />Logs</Button></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
