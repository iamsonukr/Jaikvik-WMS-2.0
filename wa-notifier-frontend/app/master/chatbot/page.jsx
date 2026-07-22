'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Modal, Input, Select, PageHeader, Empty, Badge } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import { Plus, Bot, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const blank = { keyword: '', matchType: 'contains', replyText: '', priority: 0, isActive: true };

export default function ChatbotPage() {
  const { activeClient } = useClient();
  const [rules,   setRules]   = useState([]);
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState(blank);
  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');

  const load = () => {
    if (!activeClient) { setRules([]); return; }
    api.get(`/chatbot?clientId=${activeClient._id}`).then(r => setRules(r.data)).catch(() => setRules([]));
  };

  useEffect(() => { load(); }, [activeClient]);

  const openNew  = ()  => { setForm(blank); setFormError(''); setEditing(null); setModal(true); };
  const openEdit = (r) => {
    setForm({ keyword: r.keyword, matchType: r.matchType, replyText: r.replyText, priority: r.priority, isActive: r.isActive });
    setFormError('');
    setEditing(r._id);
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
      else         await api.post('/chatbot', { ...form, clientId: activeClient._id });
      close(); load();
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Could not save this rule. Please try again.');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await api.delete(`/chatbot/${id}`);
      setRules(prev => prev.filter(r => r._id !== id));
    } catch {
      setListError('Could not delete this rule. Please try again.');
    }
  };

  const toggle = async (r) => {
    // optimistic update
    setRules(prev => prev.map(x => x._id === r._id ? { ...x, isActive: !r.isActive } : x));
    try {
      await api.patch(`/chatbot/${r._id}`, { isActive: !r.isActive });
    } catch {
      setRules(prev => prev.map(x => x._id === r._id ? { ...x, isActive: r.isActive } : x)); // revert
      setListError('Could not update this rule. Please try again.');
    }
  };

  const matchColors = { contains: 'blue', exact: 'gray', starts_with: 'yellow' };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Chatbot Rules"
        subtitle="Keyword-based auto-reply for inbound messages"
        action={<Button onClick={openNew} disabled={!activeClient}><Plus size={15}/>Add Rule</Button>}
      />

      {!activeClient && (
        <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5">
          Select a client first to manage chatbot rules.
        </div>
      )}

      {listError && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{listError}</div>
      )}

      {rules.length === 0
        ? <Empty icon={Bot} title="No rules yet" description="Add keyword rules to auto-reply to inbound WhatsApp messages." action={<Button onClick={openNew} disabled={!activeClient}><Plus size={14}/>Add Rule</Button>} />
        : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--dark-border)]">
                    {['Priority','Keyword','Match','Auto Reply','Status',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-text)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dark-border)]">
                  {rules.map(r => (
                    <tr key={r._id} className="table-row-hover">
                      <td className="px-4 py-3 text-[var(--muted-text)]">{r.priority}</td>
                      <td className="px-4 py-3 font-mono font-medium">"{r.keyword}"</td>
                      <td className="px-4 py-3"><Badge label={r.matchType} color={matchColors[r.matchType] || 'gray'} /></td>
                      <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">{r.replyText}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggle(r)} className="transition-colors">
                          {r.isActive
                            ? <ToggleRight size={22} className="text-brand" />
                            : <ToggleLeft size={22} className="text-muted-foreground" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-accent-foreground transition-colors"><Pencil size={13}/></button>
                          <button onClick={() => remove(r._id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      }

      <Modal open={modal} onClose={close} title={editing ? 'Edit Rule' : 'New Chatbot Rule'}
        footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}>
        <div className="space-y-3">
          {formError && <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{formError}</div>}
          <Input label="Keyword *" value={form.keyword} onChange={e => setForm(p => ({ ...p, keyword: e.target.value }))} placeholder="hello" />
          <Select label="Match Type" value={form.matchType} onChange={e => setForm(p => ({ ...p, matchType: e.target.value }))}>
            <option value="contains">Contains</option>
            <option value="exact">Exact match</option>
            <option value="starts_with">Starts with</option>
          </Select>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-text)]">Auto Reply *</label>
            <textarea rows={4} value={form.replyText}
              onChange={e => setForm(p => ({ ...p, replyText: e.target.value }))}
              placeholder="Hi! Thanks for reaching out. How can we help you?"
              className="border border-input bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <Input label="Priority (lower = higher priority)" type="number" value={form.priority}
            onChange={e => setForm(p => ({ ...p, priority: +e.target.value }))} />
        </div>
      </Modal>
    </AppShell>
  );
}
