'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Clock, LifeBuoy, MessageSquare, Plus, RefreshCw, Send, UserCheck } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import {
  Badge, Button, Card, Empty, Input, Modal, PageHeader, SearchableSelect, Select, Spinner,
  SortableTh, PaginationControls, sortItems, usePagination,
} from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { normalizeRole } from '@/lib/roles';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();
const statusColor = { open: 'yellow', assigned: 'blue', pending: 'yellow', resolved: 'green', closed: 'gray' };
const priorityColor = { low: 'gray', normal: 'blue', high: 'yellow', urgent: 'red' };
const statusOptions = ['open', 'assigned', 'pending', 'resolved', 'closed'];
const priorityOptions = ['low', 'normal', 'high', 'urgent'];

const blankTicket = { tenantId: '', subject: '', category: 'general', priority: 'normal', message: '' };

const idOf = (value) => String(value?._id || value?.id || value || '');
const nameOf = (user) => user?.name || user?.email || 'Unknown';
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

function TicketBadge({ value, type = 'status' }) {
  return <Badge label={String(value || '-').replace('_', ' ')} color={(type === 'priority' ? priorityColor : statusColor)[value] || 'gray'} />;
}

function senderLabel(message) {
  if (message.kind !== 'message') return 'System';
  return nameOf(message.senderId);
}

export default function TicketsWorkspace({ mode }) {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isAdmin = role === 'admin';
  const isClient = role === 'client_owner' || role === 'client_user';

  const [tickets, setTickets] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'activity', direction: 'desc' });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankTicket);
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadTickets = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const params = {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        assignedTo: isAdmin && assigneeFilter !== 'all' ? assigneeFilter : undefined,
      };
      const { data } = await api.get('/tickets', { params });
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load support tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [assigneeFilter, isAdmin, priorityFilter, search, statusFilter]);

  const loadDetail = useCallback(async (ticketId, { silent = false } = {}) => {
    if (!ticketId) return;
    if (!silent) setDetailLoading(true);
    try {
      const [ticketRes, messageRes] = await Promise.all([
        api.get(`/tickets/${ticketId}`),
        api.get(`/tickets/${ticketId}/messages`),
      ]);
      setActive(ticketRes.data);
      setMessages(Array.isArray(messageRes.data) ? messageRes.data : []);
    } catch (err) {
      if (!silent) setError(err?.response?.data?.message || 'Could not load ticket conversation');
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/tenants').then((res) => setTenants(Array.isArray(res.data) ? res.data : [])).catch(() => setTenants([]));
    api.get('/tickets/masters').then((res) => setMasters(Array.isArray(res.data) ? res.data : [])).catch(() => setMasters([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!activeId) return undefined;
    loadDetail(activeId);
    const interval = setInterval(() => loadDetail(activeId, { silent: true }), 5000);
    return () => clearInterval(interval);
  }, [activeId, loadDetail]);

  const sortedTickets = useMemo(() => sortItems(tickets, sort, {
    subject: (ticket) => ticket.subject,
    client: (ticket) => ticket.tenantId?.name,
    status: (ticket) => ticket.status,
    priority: (ticket) => priorityOptions.indexOf(ticket.priority),
    assignee: (ticket) => ticket.assignedTo?.name || ticket.assignedTo?.email,
    activity: (ticket) => ticket.lastMessageAt || ticket.updatedAt,
  }), [tickets, sort]);

  const ticketsPage = usePagination(sortedTickets, {
    initialPageSize: 10,
    resetKey: `${search}|${statusFilter}|${priorityFilter}|${assigneeFilter}|${sort.key}|${sort.direction}`,
  });

  const stats = useMemo(() => ({
    open: tickets.filter((ticket) => ['open', 'assigned', 'pending'].includes(ticket.status)).length,
    urgent: tickets.filter((ticket) => ticket.priority === 'urgent' && !['resolved', 'closed'].includes(ticket.status)).length,
    resolved: tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status)).length,
  }), [tickets]);

  const tenantOptions = useMemo(() => tenants.map((tenant) => ({
    value: tenant._id,
    label: tenant.name,
    description: tenant.contactEmail,
    searchText: `${tenant.name} ${tenant.contactEmail || ''} ${tenant.contactPhone || ''}`,
  })), [tenants]);

  const masterOptions = useMemo(() => [
    { value: '', label: 'Unassigned', description: 'Keep in admin queue' },
    ...masters.map((master) => ({
      value: master._id,
      label: master.name || master.email,
      description: master.email,
      searchText: `${master.name || ''} ${master.email || ''}`,
    })),
  ], [masters]);

  const openCreate = () => {
    setForm(blankTicket);
    setCreateOpen(true);
    setError('');
  };

  const createTicket = async () => {
    setError('');
    if (!form.subject.trim() || !form.message.trim()) {
      setError('Subject and message are required');
      return;
    }
    if (isAdmin && !form.tenantId) {
      setError('Select a client for this ticket');
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/tickets', {
        ...form,
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setCreateOpen(false);
      setForm(blankTicket);
      await loadTickets();
      setActiveId(data._id);
      setNotice('Ticket created');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create ticket');
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!activeId || !reply.trim()) return;
    setReplying(true);
    setError('');
    try {
      const { data } = await api.post(`/tickets/${activeId}/messages`, { body: reply.trim() });
      setMessages(Array.isArray(data) ? data : []);
      setReply('');
      await loadTickets();
      await loadDetail(activeId, { silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not send message');
    } finally {
      setReplying(false);
    }
  };

  const updateTicket = async (patch) => {
    if (!activeId) return;
    setUpdating(true);
    setError('');
    try {
      const { data } = await api.patch(`/tickets/${activeId}`, patch);
      setActive(data);
      await loadTickets();
      await loadDetail(activeId, { silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update ticket');
    } finally {
      setUpdating(false);
    }
  };

  const assignTicket = async (assignedTo) => {
    if (!activeId) return;
    setUpdating(true);
    setError('');
    try {
      const { data } = await api.patch(`/tickets/${activeId}/assign`, { assignedTo: assignedTo || null });
      setActive(data);
      await loadTickets();
      await loadDetail(activeId, { silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not assign ticket');
    } finally {
      setUpdating(false);
    }
  };

  const allowedRoles = mode === 'client' ? ['client_owner', 'client_user'] : mode === 'master' ? ['admin', 'master'] : ['admin'];

  return (
    <AppShell allowedRoles={allowedRoles}>
      <PageHeader
        title="Support Tickets"
        subtitle={mode === 'master' ? 'Issues assigned to you.' : mode === 'client' ? 'Chat with platform support on your issues.' : 'Assign issues and monitor client support.'}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadTickets} disabled={loading}><RefreshCw size={14} /> Refresh</Button>
            {(isClient || isAdmin) && <Button onClick={openCreate}><Plus size={15} /> New Ticket</Button>}
          </div>
        )}
      />

      {notice && <div className="soft-alert mb-5 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{notice}</div>}
      {error && <div className="soft-alert mb-5 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="mt-1 text-2xl font-bold">{stats.open}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Urgent</p><p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{stats.urgent}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Resolved</p><p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.resolved}</p></Card>
      </div>

      <div className="grid min-h-[620px] gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <Card className="overflow-hidden p-0">
          <div className={`grid gap-3 border-b border-border p-4 ${isAdmin ? 'lg:grid-cols-[1fr_150px_150px_190px]' : 'lg:grid-cols-[1fr_150px_150px]'}`}>
            <Input placeholder="Search subject, category, message..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All priorities</option>
              {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </Select>
            {isAdmin && (
              <Select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                <option value="all">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {masters.map((master) => <option key={master._id} value={master._id}>{master.name || master.email}</option>)}
              </Select>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !tickets.length ? (
            <Empty icon={LifeBuoy} title="No tickets yet" description={isClient ? 'Create a ticket when you need help from support.' : 'Incoming client issues will appear here.'} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <SortableTh label="Subject" sortKey="subject" sort={sort} onSort={setSort} />
                      <SortableTh label="Client" sortKey="client" sort={sort} onSort={setSort} />
                      <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                      <SortableTh label="Priority" sortKey="priority" sort={sort} onSort={setSort} />
                      <SortableTh label="Assignee" sortKey="assignee" sort={sort} onSort={setSort} />
                      <SortableTh label="Activity" sortKey="activity" sort={sort} onSort={setSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ticketsPage.pageItems.map((ticket) => (
                      <tr
                        key={ticket._id}
                        onClick={() => setActiveId(ticket._id)}
                        className={`cursor-pointer table-row-hover ${activeId === ticket._id ? 'bg-primary/5' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{ticket.subject}</p>
                          <p className="max-w-xs truncate text-xs text-muted-foreground">{ticket.lastMessagePreview || ticket.category}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{ticket.tenantId?.name || '-'}</p>
                          <p className="text-xs text-muted-foreground">{ticket.tenantId?.contactEmail || '-'}</p>
                        </td>
                        <td className="px-4 py-3"><TicketBadge value={ticket.status} /></td>
                        <td className="px-4 py-3"><TicketBadge value={ticket.priority} type="priority" /></td>
                        <td className="px-4 py-3 text-muted-foreground">{ticket.assignedTo ? nameOf(ticket.assignedTo) : 'Unassigned'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ticket.lastMessageAt ? formatDistanceToNow(new Date(ticket.lastMessageAt), { addSuffix: true }) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls {...ticketsPage} onPageChange={ticketsPage.setPage} onPageSizeChange={ticketsPage.setPageSize} />
            </>
          )}
        </Card>

        <Card className="flex min-h-[620px] flex-col overflow-hidden p-0">
          {!activeId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <MessageSquare size={34} />
              <p className="font-semibold text-foreground">Select a ticket</p>
              <p className="max-w-xs text-sm">Conversation and assignment controls will appear here.</p>
            </div>
          ) : detailLoading || !active ? (
            <div className="flex flex-1 items-center justify-center"><Spinner /></div>
          ) : (
            <>
              <div className="border-b border-border p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{active.subject}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {active.tenantId?.name || 'Client'} - Created {fmtDateTime(active.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <TicketBadge value={active.status} />
                    <TicketBadge value={active.priority} type="priority" />
                  </div>
                </div>
                <div className={`grid gap-3 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                  <Select label="Status" value={active.status} disabled={updating} onChange={(e) => updateTicket({ status: e.target.value })}>
                    {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                  <Select label="Priority" value={active.priority} disabled={updating || isClient} onChange={(e) => updateTicket({ priority: e.target.value })}>
                    {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </Select>
                  {isAdmin && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Assigned master</label>
                      <SearchableSelect
                        value={idOf(active.assignedTo)}
                        options={masterOptions}
                        placeholder="Assign master"
                        searchPlaceholder="Search masters..."
                        emptyText="No masters found"
                        onChange={assignTicket}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                {messages.map((message) => {
                  const mine = idOf(message.senderId) === idOf(user);
                  const system = message.kind !== 'message';
                  return (
                    <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-lg border px-3 py-2 shadow-sm ${
                        system ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                          : mine ? 'border-primary/20 bg-primary text-primary-foreground'
                            : 'border-border bg-card'
                      }`}>
                        <div className="mb-1 flex items-center gap-2 text-[11px] opacity-75">
                          {system ? <UserCheck size={12} /> : <MessageSquare size={12} />}
                          <span>{senderLabel(message)}</span>
                          <span>{fmtDateTime(message.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder="Type a message..."
                    disabled={replying}
                  />
                  <Button onClick={sendReply} disabled={replying || !reply.trim()}>
                    {replying ? <Clock size={14} /> : <Send size={14} />}
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="New support ticket"
        footer={(
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={createTicket} disabled={creating}>{creating ? 'Creating...' : 'Create ticket'}</Button>
          </>
        )}
      >
        <div className="space-y-3">
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Client</label>
              <SearchableSelect
                value={form.tenantId}
                options={tenantOptions}
                placeholder="Select client"
                searchPlaceholder="Search clients..."
                emptyText="No clients found"
                onChange={(value) => setForm((prev) => ({ ...prev, tenantId: value }))}
              />
            </div>
          )}
          <Input label="Subject" value={form.subject} onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))} placeholder="Brief issue summary" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Category" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="billing, whatsapp, campaign..." />
            <Select label="Priority" value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}>
              {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              rows={5}
              value={form.message}
              onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              placeholder="Describe the issue..."
              className="resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
