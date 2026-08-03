'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, CheckCheck, Clock, FileText, Image as ImageIcon, Paperclip, RefreshCw, Send, SlidersHorizontal, StickyNote, Tag, UserRound } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Input, Select, Spinner, StatusBadge, PaginationControls, usePagination } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();
const PRIORITY_COLOR = { low: 'gray', normal: 'blue', high: 'yellow', urgent: 'red' };
const priorityOptions = ['low', 'normal', 'high', 'urgent'];
const threadStatusOptions = ['open', 'assigned', 'pending', 'resolved'];

const dateTimeLocalValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function mediaLabel(media) {
  if (!media) return '';
  return media.filename || media.caption || media.mime_type || media.id || media.url || media.link || '';
}

function MediaPreview({ message }) {
  const media = message.media || {};
  const url = media.url || media.link || media.previewUrl;
  const type = String(message.type || media.type || '').toLowerCase();
  if (!message.media && !['image', 'audio', 'video', 'document'].includes(type)) return null;

  if (url && type === 'image') {
    return <img src={url} alt={media.caption || 'Attachment'} className="mt-2 max-h-56 rounded-lg border border-border object-contain" />;
  }
  if (url && type === 'video') {
    return <video src={url} controls className="mt-2 max-h-56 rounded-lg border border-border" />;
  }
  if (url && type === 'audio') {
    return <audio src={url} controls className="mt-2 w-full" />;
  }

  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"
    >
      {type === 'document' ? <FileText size={14} /> : type === 'image' ? <ImageIcon size={14} /> : <Paperclip size={14} />}
      <span className="min-w-0 truncate">{mediaLabel(media) || `${type || 'media'} attachment`}</span>
    </a>
  );
}

export default function InboxWorkspace({ allowedRoles }) {
  const { activeClient } = useClient();
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingThread, setUpdatingThread] = useState(false);
  const [sendError, setSendError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [team, setTeam] = useState([]);
  const [threadForm, setThreadForm] = useState({ threadStatus: 'open', priority: 'normal', slaDueAt: '', threadTags: '' });
  const [noteText, setNoteText] = useState('');
  const [showThreadTools, setShowThreadTools] = useState(false);
  const bottomRef = useRef();

  const loadThreads = () => {
    if (!activeClient) { setThreads([]); return; }
    api.get(`/inbox/threads?whatsappAccountId=${activeClient._id}`).then((r) => setThreads(r.data)).catch(() => {});
  };

  const loadTeam = () => {
    if (!activeClient) { setTeam([]); return; }
    const tenantId = activeClient.tenantId?._id || activeClient.tenantId;
    const request = tenantId
      ? api.get(`/auth/tenant-users/${tenantId}`).catch(() => api.get('/auth/team'))
      : api.get('/auth/team');
    request.then((r) => setTeam(Array.isArray(r.data) ? r.data : [])).catch(() => setTeam([]));
  };

  const loadMessages = (thread, { silent = false } = {}) => {
    if (!activeClient) return;
    if (!silent) {
      setActive(thread);
      setShowThreadTools(false);
      setLoading(true);
    }
    api.get(`/inbox/messages?whatsappAccountId=${activeClient._id}&phone=${thread.phone}`)
      .then((r) => setMessages(r.data))
      .catch(() => { if (!silent) setMessages([]); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    loadThreads();
    loadTeam();
    const interval = setInterval(loadThreads, 10000);
    return () => clearInterval(interval);
  }, [activeClient]);

  useEffect(() => {
    if (!active) return;
    setThreadForm({
      threadStatus: active.threadStatus || 'open',
      priority: active.priority || 'normal',
      slaDueAt: dateTimeLocalValue(active.slaDueAt),
      threadTags: Array.isArray(active.threadTags) ? active.threadTags.join(', ') : '',
    });
    setNoteText('');
  }, [active?._id, active?.phone]);

  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => loadMessages(active, { silent: true }), 5000);
    return () => clearInterval(interval);
  }, [active?.phone, activeClient]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const filteredThreads = useMemo(() => {
    const query = text(search.trim());
    return threads.filter((thread) => {
      const tags = Array.isArray(thread.threadTags) ? thread.threadTags : [];
      const matchesSearch = !query
        || text(thread.contactName).includes(query)
        || text(thread.phone).includes(query)
        || text(thread.text).includes(query)
        || text(thread.threadStatus).includes(query)
        || text(thread.priority).includes(query)
        || tags.some((tag) => text(tag).includes(query));
      const matchesStatus = statusFilter === 'all' || thread.threadStatus === statusFilter;
      const matchesPriority = priorityFilter === 'all' || (thread.priority || 'normal') === priorityFilter;
      const matchesTag = tagFilter === 'all' || tags.includes(tagFilter);
      const matchesAssignee = assigneeFilter === 'all'
        || (assigneeFilter === 'unassigned' && !thread.assignedTo)
        || String(thread.assignedTo || '') === assigneeFilter;
      return matchesSearch && matchesStatus && matchesPriority && matchesTag && matchesAssignee;
    });
  }, [threads, search, statusFilter, priorityFilter, tagFilter, assigneeFilter]);
  const threadsPage = usePagination(filteredThreads, {
    initialPageSize: 25,
    resetKey: `${search}|${statusFilter}|${priorityFilter}|${tagFilter}|${assigneeFilter}`,
  });

  const statusOptions = useMemo(() => {
    const values = [...threadStatusOptions, ...threads.map((thread) => thread.threadStatus).filter(Boolean)];
    return Array.from(new Set(values)).sort();
  }, [threads]);

  const allThreadTags = useMemo(() => (
    Array.from(new Set(threads.flatMap((thread) => Array.isArray(thread.threadTags) ? thread.threadTags : []))).sort()
  ), [threads]);

  const teamById = useMemo(() => new Map(team.map((member) => [String(member._id), member])), [team]);

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

  const applyThreadUpdate = (updated) => {
    if (!updated) return;
    setActive((prev) => prev && prev.phone === updated.phone ? { ...prev, ...updated } : prev);
    setThreads((prev) => prev.map((thread) => thread.phone === updated.phone ? { ...thread, ...updated } : thread));
  };

  const assignThread = async (userId) => {
    if (!active) return;
    setUpdatingThread(true);
    setSendError('');
    try {
      const { data } = await api.post('/inbox/thread/assign', {
        whatsappAccountId: activeClient._id,
        phone: active.phone,
        userId: userId || undefined,
      });
      applyThreadUpdate(data);
      loadThreads();
    } catch (err) {
      setSendError(err?.response?.data?.message || 'Could not assign this conversation.');
    } finally {
      setUpdatingThread(false);
    }
  };

  const saveThreadMetadata = async () => {
    if (!active) return;
    setUpdatingThread(true);
    setSendError('');
    try {
      const { data } = await api.post('/inbox/thread/update', {
        whatsappAccountId: activeClient._id,
        phone: active.phone,
        threadStatus: threadForm.threadStatus,
        priority: threadForm.priority,
        slaDueAt: threadForm.slaDueAt || null,
        threadTags: threadForm.threadTags.split(',').map((value) => value.trim()).filter(Boolean),
      });
      applyThreadUpdate(data);
      loadThreads();
    } catch (err) {
      setSendError(err?.response?.data?.message || 'Could not update conversation details.');
    } finally {
      setUpdatingThread(false);
    }
  };

  const addNote = async () => {
    if (!active || !noteText.trim()) return;
    setUpdatingThread(true);
    setSendError('');
    try {
      const { data } = await api.post('/inbox/thread/notes', {
        whatsappAccountId: activeClient._id,
        phone: active.phone,
        text: noteText.trim(),
      });
      applyThreadUpdate(data);
      setNoteText('');
      loadThreads();
    } catch (err) {
      setSendError(err?.response?.data?.message || 'Could not add internal note.');
    } finally {
      setUpdatingThread(false);
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
          <div className="border-b border-border px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Inbox</h2>
              <button onClick={loadThreads} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Refresh threads">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="grid gap-1.5">
              <Input className="h-9" placeholder="Search conversations..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Select className="h-8 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
                <Select className="h-8 text-xs" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                  <option value="all">All priorities</option>
                  {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </Select>
                <Select className="h-8 text-xs" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                  <option value="all">All tags</option>
                  {allThreadTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </Select>
                <Select className="h-8 text-xs" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="all">All assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {team.map((member) => <option key={member._id} value={member._id}>{member.name || member.email}</option>)}
                </Select>
              </div>
            </div>
          </div>

          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {filteredThreads.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No conversations match these filters</p>
            )}
            {threadsPage.pageItems.map((thread) => (
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
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <StatusBadge status={thread.threadStatus} />
                    <Badge label={thread.priority || 'normal'} color={PRIORITY_COLOR[thread.priority || 'normal'] || 'gray'} />
                    {thread.assignedTo && <Badge label={teamById.get(String(thread.assignedTo))?.name || 'Assigned'} color="blue" />}
                    {thread.slaDueAt && (
                      <Badge
                        label={`SLA ${format(new Date(thread.slaDueAt), 'dd MMM HH:mm')}`}
                        color={new Date(thread.slaDueAt) < new Date() && thread.threadStatus !== 'resolved' ? 'red' : 'gray'}
                      />
                    )}
                  </div>
                  {Array.isArray(thread.threadTags) && thread.threadTags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {thread.threadTags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {filteredThreads.length > 0 && (
            <PaginationControls
              {...threadsPage}
              onPageChange={threadsPage.setPage}
              onPageSizeChange={threadsPage.setPageSize}
              pageSizeOptions={[10, 25, 50]}
            />
          )}
        </div>

        <div className={`${active ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a conversation</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-4">
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
                  <div className="hidden items-center gap-2 sm:flex">
                    <Badge label={active.priority || 'normal'} color={PRIORITY_COLOR[active.priority || 'normal'] || 'gray'} />
                    <StatusBadge status={active.threadStatus} />
                  </div>
                  <Button size="sm" variant={showThreadTools ? 'secondary' : 'ghost'} onClick={() => setShowThreadTools((current) => !current)}>
                    <SlidersHorizontal size={13} /> Details
                  </Button>
                  {active.threadStatus !== 'resolved' && (
                    <Button size="sm" variant="outline" onClick={resolve}><CheckCheck size={13} />Resolve</Button>
                  )}
                </div>
              </div>

              {showThreadTools && (
              <div className="border-b border-border bg-card/95 px-3 py-2 sm:px-4">
                <div className="grid gap-2 xl:grid-cols-[150px_130px_130px_180px_minmax(160px,1fr)_auto]">
                  <Select
                    label="Assigned to"
                    className="h-8 text-xs"
                    value={active.assignedTo ? String(active.assignedTo) : ''}
                    onChange={(e) => assignThread(e.target.value)}
                    disabled={updatingThread}
                  >
                    <option value="">Unassigned</option>
                    {team.map((member) => <option key={member._id} value={member._id}>{member.name || member.email}</option>)}
                  </Select>
                  <Select
                    label="Status"
                    className="h-8 text-xs"
                    value={threadForm.threadStatus}
                    onChange={(e) => setThreadForm((prev) => ({ ...prev, threadStatus: e.target.value }))}
                    disabled={updatingThread}
                  >
                    {threadStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                  <Select
                    label="Priority"
                    className="h-8 text-xs"
                    value={threadForm.priority}
                    onChange={(e) => setThreadForm((prev) => ({ ...prev, priority: e.target.value }))}
                    disabled={updatingThread}
                  >
                    {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </Select>
                  <Input
                    label="SLA due"
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={threadForm.slaDueAt}
                    onChange={(e) => setThreadForm((prev) => ({ ...prev, slaDueAt: e.target.value }))}
                    disabled={updatingThread}
                  />
                  <Input
                    label="Tags"
                    className="h-8 text-xs"
                    value={threadForm.threadTags}
                    onChange={(e) => setThreadForm((prev) => ({ ...prev, threadTags: e.target.value }))}
                    placeholder="billing, vip"
                    disabled={updatingThread}
                  />
                  <div className="flex items-end">
                    <Button size="sm" className="h-8" onClick={saveThreadMetadata} disabled={updatingThread}>
                      {updatingThread ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="flex gap-2">
                    <Input
                      className="h-9"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add an internal note..."
                      disabled={updatingThread}
                    />
                    <Button variant="outline" onClick={addNote} disabled={updatingThread || !noteText.trim()}>
                      <StickyNote size={14} /> Note
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound size={13} />
                    <span>{active.assignedTo ? (teamById.get(String(active.assignedTo))?.name || 'Assigned') : 'Unassigned'}</span>
                    {active.slaDueAt && (
                      <>
                        <Clock size={13} className="ml-2" />
                        <span className={new Date(active.slaDueAt) < new Date() && active.threadStatus !== 'resolved' ? 'text-red-600 dark:text-red-400' : ''}>
                          {format(new Date(active.slaDueAt), 'dd MMM yyyy HH:mm')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {Array.isArray(active.internalNotes) && active.internalNotes.length > 0 && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <StickyNote size={13} /> Internal Notes
                    </div>
                    <div className="max-h-20 space-y-2 overflow-y-auto">
                      {active.internalNotes.slice().reverse().map((note, index) => (
                        <div key={`${note.createdAt}-${index}`} className="text-xs">
                          <p className="text-foreground">{note.text}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            {note.authorName || 'Team member'} - {note.createdAt ? format(new Date(note.createdAt), 'dd MMM HH:mm') : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/40 px-3 py-3 sm:px-4">
                {loading && <div className="flex justify-center py-10"><Spinner /></div>}
                {messages.map((message) => (
                  <div key={message._id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[86%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${message.direction === 'outbound'
                      ? 'rounded-br-sm bg-brand text-white'
                      : 'rounded-bl-sm border border-border bg-card text-card-foreground'}`}>
                      {message.text && <p className="leading-relaxed">{message.text}</p>}
                      <MediaPreview message={message} />
                      {!message.text && !message.media && <p className="leading-relaxed">(media message)</p>}
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
              <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2 sm:px-4">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder="Type a reply..."
                  className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-dark disabled:opacity-50" aria-label="Send reply">
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
