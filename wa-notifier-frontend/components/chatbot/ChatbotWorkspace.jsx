'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bot, Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const blank = { keyword: '', matchType: 'contains', replyText: '', priority: 0, isActive: true };
const matchColors = { contains: 'blue', exact: 'gray', starts_with: 'yellow' };
const text = (value) => String(value || '').toLowerCase();

export default function ChatbotWorkspace({ allowedRoles }) {
  const { activeClient } = useClient();
  const [rules, setRules] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'priority', direction: 'asc' });

  const load = () => {
    if (!activeClient) { setRules([]); return; }
    api.get(`/chatbot?whatsappAccountId=${activeClient._id}`).then((r) => setRules(r.data)).catch(() => setRules([]));
  };

  useEffect(() => { load(); }, [activeClient]);

  const openNew = () => { setForm(blank); setFormError(''); setEditing(null); setModal(true); };
  const openEdit = (rule) => {
    setForm({ keyword: rule.keyword, matchType: rule.matchType, replyText: rule.replyText, priority: rule.priority, isActive: rule.isActive });
    setFormError('');
    setEditing(rule._id);
    setModal(true);
  };
  const close = () => setModal(false);

  const save = async () => {
    if (!activeClient) { setFormError('Select a client first.'); return; }
    if (!form.keyword.trim()) { setFormError('Keyword is required.'); return; }
    if (!form.replyText.trim()) { setFormError('Auto reply text is required.'); return; }
    setFormError('');
    setSaving(true);
    try {
      if (editing) await api.patch(`/chatbot/${editing}`, form);
      else await api.post('/chatbot', { ...form, whatsappAccountId: activeClient._id });
      close();
      load();
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Could not save this rule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await api.delete(`/chatbot/${id}`);
      setRules((prev) => prev.filter((rule) => rule._id !== id));
    } catch {
      setListError('Could not delete this rule. Please try again.');
    }
  };

  const toggle = async (rule) => {
    setRules((prev) => prev.map((item) => item._id === rule._id ? { ...item, isActive: !rule.isActive } : item));
    try {
      await api.patch(`/chatbot/${rule._id}`, { isActive: !rule.isActive });
    } catch {
      setRules((prev) => prev.map((item) => item._id === rule._id ? { ...item, isActive: rule.isActive } : item));
      setListError('Could not update this rule. Please try again.');
    }
  };

  const filteredRules = useMemo(() => {
    const query = text(search.trim());
    return rules.filter((rule) => {
      const matchesSearch = !query
        || text(rule.keyword).includes(query)
        || text(rule.matchType).includes(query)
        || text(rule.replyText).includes(query);
      const matchesMatch = matchFilter === 'all' || rule.matchType === matchFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && rule.isActive)
        || (statusFilter === 'inactive' && !rule.isActive);
      return matchesSearch && matchesMatch && matchesStatus;
    });
  }, [rules, search, matchFilter, statusFilter]);

  const sortedRules = useMemo(() => sortItems(filteredRules, sort, {
    priority: (rule) => rule.priority ?? 0,
    keyword: (rule) => rule.keyword,
    match: (rule) => rule.matchType,
    reply: (rule) => rule.replyText,
    status: (rule) => Boolean(rule.isActive),
  }), [filteredRules, sort]);
  const rulesPage = usePagination(sortedRules, {
    initialPageSize: 10,
    resetKey: `${search}|${matchFilter}|${statusFilter}|${sort.key}|${sort.direction}`,
  });

  return (
    <AppShell allowedRoles={allowedRoles}>
      <PageHeader
        title="Chatbot Rules"
        subtitle="Keyword-based auto-reply for inbound messages"
        action={<Button onClick={openNew} disabled={!activeClient}><Plus size={15} />Add Rule</Button>}
      />

      {!activeClient && (
        <div className="soft-alert mb-5 border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          Select a client first to manage chatbot rules.
        </div>
      )}

      {listError && (
        <div className="soft-alert mb-5 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{listError}</div>
      )}

      {rules.length === 0 ? (
        <Empty icon={Bot} title="No rules yet" description="Add keyword rules to auto-reply to inbound WhatsApp messages." action={<Button onClick={openNew} disabled={!activeClient}><Plus size={14} />Add Rule</Button>} />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px_160px]">
            <Input placeholder="Search keyword or reply text..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}>
              <option value="all">All match types</option>
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="starts_with">Starts with</option>
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Priority" sortKey="priority" sort={sort} onSort={setSort} />
                  <SortableTh label="Keyword" sortKey="keyword" sort={sort} onSort={setSort} />
                  <SortableTh label="Match" sortKey="match" sort={sort} onSort={setSort} />
                  <SortableTh label="Auto Reply" sortKey="reply" sort={sort} onSort={setSort} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredRules.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No rules match these filters.</td></tr>
                )}
                {rulesPage.pageItems.map((rule) => (
                  <tr key={rule._id} className="table-row-hover">
                    <td className="px-4 py-3 text-muted-foreground">{rule.priority}</td>
                    <td className="px-4 py-3 font-mono font-medium">"{rule.keyword}"</td>
                    <td className="px-4 py-3"><Badge label={rule.matchType} color={matchColors[rule.matchType] || 'gray'} /></td>
                    <td className="max-w-md truncate px-4 py-3 text-muted-foreground">{rule.replyText}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(rule)} className="transition-colors" aria-label="Toggle rule status">
                        {rule.isActive
                          ? <ToggleRight size={22} className="text-brand" />
                          : <ToggleLeft size={22} className="text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(rule)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Edit rule"><Pencil size={13} /></button>
                        <button onClick={() => remove(rule._id)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500" aria-label="Delete rule"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls {...rulesPage} onPageChange={rulesPage.setPage} onPageSizeChange={rulesPage.setPageSize} />
        </Card>
      )}

      <Modal open={modal} onClose={close} title={editing ? 'Edit Rule' : 'New Chatbot Rule'}
        footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button></>}>
        <div className="space-y-3">
          {formError && <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{formError}</div>}
          <Input label="Keyword *" value={form.keyword} onChange={(e) => setForm((prev) => ({ ...prev, keyword: e.target.value }))} placeholder="hello" />
          <Select label="Match Type" value={form.matchType} onChange={(e) => setForm((prev) => ({ ...prev, matchType: e.target.value }))}>
            <option value="contains">Contains</option>
            <option value="exact">Exact match</option>
            <option value="starts_with">Starts with</option>
          </Select>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Auto Reply *</label>
            <textarea rows={4} value={form.replyText}
              onChange={(e) => setForm((prev) => ({ ...prev, replyText: e.target.value }))}
              placeholder="Hi! Thanks for reaching out. How can we help you?"
              className="resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <Input label="Priority (lower = higher priority)" type="number" value={form.priority}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: +e.target.value }))} />
        </div>
      </Modal>
    </AppShell>
  );
}
