'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Input, Select, PageHeader } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const tagName = (tag) => typeof tag === 'string' ? tag : tag?.name;

export default function NewBroadcastWorkspace({ allowedRoles, basePath }) {
  const { activeClient } = useClient();
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [count, setCount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [form, setForm] = useState({ name: '', templateName: '', languageCode: 'en' });

  useEffect(() => {
    if (!activeClient) { setTemplates([]); setTags([]); return; }
    api.get(`/templates?whatsappAccountId=${activeClient._id}`).then(r => setTemplates(r.data)).catch(() => setTemplates([]));
    api.get(`/contacts/tags?whatsappAccountId=${activeClient._id}`).then(r => setTags((r.data || []).map(tagName).filter(Boolean))).catch(() => setTags([]));
  }, [activeClient]);

  useEffect(() => {
    if (!activeClient) { setCount(null); return; }
    const params = new URLSearchParams({ whatsappAccountId: activeClient._id });
    selectedTags.forEach(t => params.append('tag', t));
    api.get(`/contacts/count?${params.toString()}`)
      .then(r => setCount(r.data.count))
      .catch(() => setCount(null));
  }, [activeClient, selectedTags]);

  const toggleTag = (tag) => setSelectedTags(prev => prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]);
  const selected = templates.find(template => template.name === form.templateName);

  const createCampaign = async ({ sendNow = false, schedule = false } = {}) => {
    if (!activeClient) { setError('Select a client first.'); return; }
    if (!form.name.trim()) { setError('Campaign name is required.'); return; }
    if (!form.templateName) { setError('Select a template.'); return; }
    if ((sendNow || schedule) && (count === 0 || count === null)) {
      setError('No contacts match this audience. Adjust your tags or add contacts before sending.');
      return;
    }
    if (schedule && !scheduledAt) { setError('Choose when this campaign should be sent.'); return; }

    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/broadcasts', {
        ...form,
        whatsappAccountId: activeClient._id,
        targetTags: selectedTags,
        components: [],
        status: schedule ? 'scheduled' : 'draft',
        scheduledAt: schedule ? new Date(scheduledAt).toISOString() : undefined,
      });
      if (sendNow) await api.post(`/broadcasts/${data._id}/send`);
      router.push(`${basePath}/broadcasts`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save the campaign. Please try again.');
      setSaving(false);
    }
  };

  return (
    <AppShell allowedRoles={allowedRoles}>
      <PageHeader title="New Campaign" subtitle="Create, schedule, or immediately send a WhatsApp template campaign" />

      {!activeClient && (
        <div className="soft-alert mb-5 max-w-3xl border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          Select a client first from the sidebar to create a campaign.
        </div>
      )}

      {error && (
        <div className="soft-alert mb-5 max-w-3xl border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>
      )}

      <div className="max-w-3xl space-y-5">
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold">Campaign Details</h3>
          <Input label="Campaign Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="June Newsletter" disabled={!activeClient} />

          <Select label="Template *" value={form.templateName} disabled={!activeClient} onChange={e => setForm(p => ({ ...p, templateName: e.target.value, languageCode: templates.find(t => t.name === e.target.value)?.language || 'en' }))}>
            <option value="">Select a template...</option>
            {templates.filter(t => t.status?.toUpperCase() === 'APPROVED').map(t => (
              <option key={t._id} value={t.name}>{t.name} ({t.language})</option>
            ))}
          </Select>
          {activeClient && templates.length > 0 && templates.filter(t => t.status?.toUpperCase() === 'APPROVED').length === 0 && (
            <p className="text-xs text-amber-600">No approved templates found. Sync or check approval status on the Templates page.</p>
          )}

          {selected && (
            <div className="rounded-lg bg-muted/70 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Preview</p>
              <p className="leading-relaxed text-foreground">
                {selected.components?.find(c => c.type === 'BODY')?.text || 'No body text'}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Target Audience</h3>
          <p className="mb-3 text-xs text-muted-foreground">Select tags to target opted-in active contacts, or leave empty to send to every opted-in active contact.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {tags.map(tag => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedTags.includes(tag) ? 'border-brand bg-brand text-white' : 'border-border hover:bg-accent hover:text-accent-foreground'
                }`}>
                {selectedTags.includes(tag) && <span className="mr-1">+</span>}
                {tag}
              </button>
            ))}
            {activeClient && tags.length === 0 && <p className="text-xs text-muted-foreground">No tags found. All opted-in active contacts will be targeted.</p>}
          </div>
          <div className={`rounded-lg border px-4 py-2.5 text-sm ${count === 0 ? 'border-red-200 bg-red-50' : 'border-brand/20 bg-brand/5'}`}>
            <span className={`font-semibold ${count === 0 ? 'text-red-600' : 'text-brand'}`}>{count ?? '...'}</span>
            <span className="text-muted-foreground"> contacts match this segment</span>
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold">Schedule</h3>
          <Input label="Scheduled send time" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} disabled={!activeClient} />
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={() => createCampaign()} disabled={saving || !activeClient}>Save Draft</Button>
          <Button variant="outline" onClick={() => createCampaign({ schedule: true })} disabled={saving || !activeClient || !form.name || !form.templateName || !scheduledAt}>Save & Schedule</Button>
          <Button onClick={() => createCampaign({ sendNow: true })} disabled={saving || !activeClient || !form.name || !form.templateName}>
            {saving ? 'Processing...' : 'Save & Send Now'}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
