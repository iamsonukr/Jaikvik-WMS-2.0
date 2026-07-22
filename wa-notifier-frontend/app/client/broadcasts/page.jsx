'use client';
import { useEffect, useState, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, PageHeader, StatusBadge, Spinner, Empty } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import Link from 'next/link';
import { Plus, Megaphone, Send, Eye as EyeIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function BroadcastsPage() {
  const { activeClient } = useClient();
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [sending,    setSending]    = useState({});
  const [sendError,  setSendError]  = useState('');
  const pollRefs = useRef({}); // broadcastId -> interval id, so we can clear them all on unmount

  const load = () => {
    if (!activeClient) { setBroadcasts([]); return; }
    setLoading(true);
    api.get(`/broadcasts?clientId=${activeClient._id}`)
      .then(r => setBroadcasts(r.data))
      .catch(() => setBroadcasts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeClient]);

  // Clear any in-flight polls when the page unmounts or the active client changes
  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
      pollRefs.current = {};
    };
  }, [activeClient]);

  const send = async (id) => {
    if (!confirm('Start sending this broadcast now?')) return;
    setSendError('');
    setSending(p => ({ ...p, [id]: true }));
    try {
      await api.post(`/broadcasts/${id}/send`);
      // Optimistically flip to running, then poll until done
      setBroadcasts(prev => prev.map(b => b._id === id ? { ...b, status: 'running' } : b));
      const poll = setInterval(async () => {
        try {
          const { data } = await api.get(`/broadcasts/${id}`);
          setBroadcasts(prev => prev.map(b => b._id === id ? data : b));
          if (data.status === 'done' || data.status === 'failed') {
            clearInterval(poll);
            delete pollRefs.current[id];
            setSending(p => ({ ...p, [id]: false }));
          }
        } catch {
          clearInterval(poll);
          delete pollRefs.current[id];
          setSending(p => ({ ...p, [id]: false }));
        }
      }, 3000);
      pollRefs.current[id] = poll;
    } catch (err) {
      setSendError(err?.response?.data?.message || 'Could not start the broadcast. It may already be running.');
      setSending(p => ({ ...p, [id]: false }));
      load(); // resync actual status from server
    }
  };

  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) + '%' : '—';

  return (
    <AppShell allowedRoles={['client_owner','client_user']}>
      <PageHeader
        title="Broadcasts"
        subtitle="Bulk WhatsApp campaigns"
        action={<Link href="/client/broadcasts/new"><Button><Plus size={15}/>New Campaign</Button></Link>}
      />

      {sendError && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{sendError}</div>
      )}

      {loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!loading && broadcasts.length === 0 && (
        <Empty icon={Megaphone} title="No campaigns yet" description="Create a broadcast to start sending template messages to your contacts." action={<Link href="/client/broadcasts/new"><Button><Plus size={14}/>New Campaign</Button></Link>} />
      )}

      {!loading && broadcasts.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--dark-border)]">
                  {['Campaign','Template','Status','Total','Sent','Delivered','Read','Failed','Created',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-text)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dark-border)]">
                {broadcasts.map(b => (
                  <tr key={b._id} className="table-row-hover">
                    <td className="px-4 py-3 font-medium max-w-[160px] truncate">{b.name}</td>
                    <td className="px-4 py-3 text-[var(--muted-text)]">{b.templateName}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3">{b.totalCount}</td>
                    <td className="px-4 py-3">{b.sentCount}</td>
                    <td className="px-4 py-3 text-green-600">{b.deliveredCount} <span className="text-muted-foreground text-xs">({pct(b.deliveredCount, b.sentCount)})</span></td>
                    <td className="px-4 py-3 text-yellow-600">{b.readCount} <span className="text-muted-foreground text-xs">({pct(b.readCount, b.sentCount)})</span></td>
                    <td className="px-4 py-3 text-red-500">{b.failedCount}</td>
                    <td className="px-4 py-3 text-[var(--muted-text)] whitespace-nowrap">{format(new Date(b.createdAt), 'dd MMM, HH:mm')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {b.status === 'draft' && (
                          <Button size="sm" onClick={() => send(b._id)} disabled={sending[b._id]}>
                            <Send size={12}/>{sending[b._id] ? 'Sending…' : 'Send'}
                          </Button>
                        )}
                        <Link href={`/broadcasts/${b._id}`}><Button size="sm" variant="ghost"><EyeIcon size={12}/>Logs</Button></Link>
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
