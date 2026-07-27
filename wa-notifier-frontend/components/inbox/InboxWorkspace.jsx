'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, CheckCheck, RefreshCw, Send } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Button, Input, Select, Spinner, StatusBadge } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();

export default function InboxWorkspace({ allowedRoles }) {
  const { activeClient } = useClient();
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const bottomRef = useRef();

  const loadThreads = () => {
    if (!activeClient) { setThreads([]); return; }
    api.get(`/inbox/threads?whatsappAccountId=${activeClient._id}`).then((r) => setThreads(r.data)).catch(() => {});
  };

  const loadMessages = (thread, { silent = false } = {}) => {
    if (!activeClient) return;
    if (!silent) {
      setActive(thread);
      setLoading(true);
    }
    api.get(`/inbox/messages?whatsappAccountId=${activeClient._id}&phone=${thread.phone}`)
      .then((r) => setMessages(r.data))
      .catch(() => { if (!silent) setMessages([]); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    loadThreads();
    const interval = setInterval(loadThreads, 10000);
    return () => clearInterval(interval);
  }, [activeClient]);

  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => loadMessages(active, { silent: true }), 5000);
    return () => clearInterval(interval);
  }, [active?.phone, activeClient]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const filteredThreads = useMemo(() => {
    const query = text(search.trim());
    return threads.filter((thread) => {
      const matchesSearch = !query
        || text(thread.contactName).includes(query)
        || text(thread.phone).includes(query)
        || text(thread.text).includes(query)
        || text(thread.threadStatus).includes(query);
      const matchesStatus = statusFilter === 'all' || thread.threadStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [threads, search, statusFilter]);

  const statusOptions = useMemo(() => {
    const values = threads.map((thread) => thread.threadStatus).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [threads]);

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setSending(true);
    setSendError('');
    const messageText = reply;
    try {
      const { data } = await api.post('/inbox/reply', { whatsappAccountId: activeClient._id, phone: active.phone, text: messageText });
      setMessages((prev) => [...prev, data]);
      setReply('');
    } catch (err) {
      setSendError(err?.response?.data?.message || 'Could not send message. The contact may be outside the 24-hour session window. Try a template message instead.');
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!active) return;
    try {
      await api.post('/inbox/resolve', { whatsappAccountId: activeClient._id, phone: active.phone });
      setActive((prev) => prev ? { ...prev, threadStatus: 'resolved' } : prev);
      loadThreads();
    } catch {
      setSendError('Could not resolve this conversation. Please try again.');
    }
  };

  const initials = (name) => name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <AppShell allowedRoles={allowedRoles}>
      <div className="app-panel -m-4 flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-none sm:-m-5 lg:-m-6 lg:flex-row lg:rounded-lg">
        <div className={`${active ? 'hidden lg:flex' : 'flex'} w-full flex-col border-b border-border lg:w-80 lg:flex-shrink-0 lg:border-b-0 lg:border-r`}>
          <div className="border-b border-border px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Inbox</h2>
              <button onClick={loadThreads} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Refresh threads">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="grid gap-2">
              <Input placeholder="Search conversations..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {filteredThreads.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No conversations match these filters</p>
            )}
            {filteredThreads.map((thread) => (
              <button
                key={thread._id}
                onClick={() => loadMessages(thread)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70 ${active?.phone === thread.phone ? 'border-l-2 border-brand bg-brand/10' : ''}`}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                  {initials(thread.contactName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{thread.contactName || thread.phone}</p>
                    <span className="text-xs text-muted-foreground">{thread.createdAt ? format(new Date(thread.createdAt), 'HH:mm') : '-'}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{thread.text || '(media)'}</p>
                  <div className="mt-1"><StatusBadge status={thread.threadStatus} /></div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`${active ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a conversation</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={() => setActive(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden" aria-label="Back to conversations">
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{active.contactName || active.phone}</p>
                    <p className="truncate text-xs text-muted-foreground">{active.phone}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={active.threadStatus} />
                  {active.threadStatus !== 'resolved' && (
                    <Button size="sm" variant="outline" onClick={resolve}><CheckCheck size={13} />Resolve</Button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/40 px-4 py-4 sm:px-5">
                {loading && <div className="flex justify-center py-10"><Spinner /></div>}
                {messages.map((message) => (
                  <div key={message._id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[86%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${message.direction === 'outbound'
                      ? 'rounded-br-sm bg-brand text-white'
                      : 'rounded-bl-sm border border-border bg-card text-card-foreground'}`}>
                      <p className="leading-relaxed">{message.text || '(media message)'}</p>
                      <p className={`mt-1 text-xs ${message.direction === 'outbound' ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {message.createdAt ? format(new Date(message.createdAt), 'HH:mm') : '-'}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {sendError && (
                <div className="border-t border-red-500/25 bg-red-500/10 px-4 py-2 text-xs text-red-700 dark:text-red-300">{sendError}</div>
              )}
              <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-3">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder="Type a reply..."
                  className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-dark disabled:opacity-50" aria-label="Send reply">
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
