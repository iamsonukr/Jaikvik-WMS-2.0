'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Spinner } from '@/components/ui';
import { Settings as SettingsIcon } from 'lucide-react';
import api from '@/lib/api';
import TwoFactorSettings from '@/components/security/TwoFactorSettings';
import SettingsTabs from '@/components/settings/SettingsTabs';

export default function AdminSettingsPage() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => { api.get('/settings').then((r) => setForm(r.data)); }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.patch('/settings', {
        companyName: form.companyName,
        supportEmail: form.supportEmail,
        defaultTaxPercent: Number(form.defaultTaxPercent),
        defaultTrialDays: Number(form.defaultTrialDays),
        defaultCurrency: form.defaultCurrency,
      });
      setForm(data);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Settings" subtitle="Platform-wide defaults. Razorpay/Meta credentials are configured via environment variables, not here." />
      <SettingsTabs active={activeTab} onChange={setActiveTab} tabs={[{ id: 'general', label: 'General' }, { id: 'plans', label: 'Plans & billing' }, { id: 'security', label: 'Security' }]} />
      <div role="tabpanel" id={`settings-panel-${activeTab}`} aria-labelledby={`settings-tab-${activeTab}`}>
      {activeTab === 'security' ? <TwoFactorSettings /> : <>

      {!form ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <Card className="max-w-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SettingsIcon size={16} /> {activeTab === 'plans' ? 'Plans & billing defaults' : 'General'}
          </div>
          {activeTab === 'general' && <>
          <Input label="Company name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label="Support email" type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
          </>}
          {activeTab === 'plans' && <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Default tax % (new plans)" type="number" value={form.defaultTaxPercent}
              onChange={(e) => setForm({ ...form, defaultTaxPercent: e.target.value })} />
            <Input label="Default trial days (new plans)" type="number" value={form.defaultTrialDays}
              onChange={(e) => setForm({ ...form, defaultTrialDays: e.target.value })} />
          </div>
          <Input label="Default currency" value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })} />
          </>}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
            {saved && <span className="text-xs text-emerald-500">Saved</span>}
          </div>
        </Card>
      )}
      </>}
      </div>
    </AppShell>
  );
}
