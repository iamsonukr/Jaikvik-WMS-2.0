'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Input, Select, PageHeader } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const tagName = (tag) => typeof tag === 'string' ? tag : tag?.name;

export default function NewBroadcastPage() {
  const { activeClient } = useClient();
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [tags,      setTags]      = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [count,     setCount]     = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [form, setForm] = useState({
    name: '', templateName: '', languageCode: 'en',
  });

  useEffect(() => {
    if (!activeClient) { setTemplates([]); setTags([]); return; }
    api.get(`/templates?clientId=${activeClient._id}`).then(r => setTemplates(r.data)).catch(() => setTemplates([]));
    api.get(`/contacts/tags?clientId=${activeClient._id}`).then(r => setTags((r.data || []).map(tagName).filter(Boolean))).catch(() => setTags([]));
  }, [activeClient]);

  useEffect(() => {
    if (!activeClient) { setCount(null); return; }
    const params = new URLSearchParams({ clientId: activeClient._id });
    selectedTags.forEach(t => params.append('tag', t));
    api.get(`/contacts/count?${params.toString()}`)
      .then(r => setCount(r.data.count))
      .catch(() => setCount(null));
  }, [activeClient, selectedTags]);

  const toggleTag = (t) => setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const selected = templates.find(t => t.name === form.templateName);

  const save = async (andSend = false) => {
    if (!activeClient) { setError('Select a client first.'); return; }
    if (!form.name.trim()) { setError('Campaign name is required.'); return; }
    if (!form.templateName) { setError('Select a template.'); return; }
    if (andSend && (count === 0 || count === null)) {
      setError('No contacts match this audience. Adjust your tags or add contacts before sending.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/broadcasts', {
        ...form,
        clientId: activeClient._id,
        targetTags: selectedTags,
        components: [],
        status: 'draft',
      });
      if (andSend) await api.post(`/broadcasts/${data._id}/send`);
      router.push('/client/broadcasts');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save the campaign. Please try again.');
      setSaving(false);
    }
  };

  return (
    <AppShell allowedRoles={['client_owner','client_user']}>
      <PageHeader title="New Campaign" subtitle="Send a WhatsApp template broadcast" />

      {!activeClient && (
        <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 max-w-2xl mb-5">
          Select a client first from the sidebar to create a campaign.
        </div>
      )}

      {error && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 max-w-2xl mb-5">{error}</div>
      )}

      <div className="max-w-2xl space-y-5">
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-sm">Campaign Details</h3>
          <Input label="Campaign Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="June Newsletter" disabled={!activeClient} />

          <Select label="Template *" value={form.templateName} disabled={!activeClient} onChange={e => setForm(p => ({ ...p, templateName: e.target.value, languageCode: templates.find(t => t.name === e.target.value)?.language || 'en' }))}>
            <option value="">Select a template…</option>
            {templates.filter(t => t.status?.toUpperCase() === 'APPROVED').map(t => (
              <option key={t._id} value={t.name}>{t.name} ({t.language})</option>
            ))}
          </Select>
          {activeClient && templates.length > 0 && templates.filter(t => t.status?.toUpperCase() === 'APPROVED').length === 0 && (
            <p className="text-xs text-amber-600">No approved templates found. Sync or check approval status on the Templates page.</p>
          )}

          {selected && (
            <div className="bg-muted/70 rounded-lg p-3 text-sm">
              <p className="font-medium text-xs text-[var(--muted-text)] mb-1">Preview</p>
              <p className="text-foreground leading-relaxed">
                {selected.components?.find(c => c.type === 'BODY')?.text || 'No body text'}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">Target Audience</h3>
          <p className="text-xs text-[var(--muted-text)] mb-3">Select tags to target a segment, or leave empty to send to all active contacts.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map(t => (
              <button key={t} onClick={() => toggleTag(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${selectedTags.includes(t) ? 'bg-brand text-white border-brand' : 'border-border hover:bg-accent hover:text-accent-foreground'}`}>
                {selectedTags.includes(t) && <span className="mr-1">✓</span>}
                {t}
              </button>
            ))}
            {activeClient && tags.length === 0 && <p className="text-xs text-[var(--muted-text)]">No tags found. All contacts will be targeted.</p>}
          </div>
          <div className={`rounded-lg px-4 py-2.5 text-sm border ${count === 0 ? 'bg-red-50 border-red-200' : 'bg-brand/5 border-brand/20'}`}>
            <span className={`font-semibold ${count === 0 ? 'text-red-600' : 'text-brand'}`}>{count ?? '…'}</span>
            <span className="text-muted-foreground"> contacts will receive this message</span>
          </div>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => save(false)} disabled={saving || !activeClient}>Save as Draft</Button>
          <Button onClick={() => save(true)} disabled={saving || !activeClient || !form.name || !form.templateName}>
            {saving ? 'Processing…' : 'Save & Send Now'}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
