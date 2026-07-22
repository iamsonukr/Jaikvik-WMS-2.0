'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner } from '@/components/ui';
import { Receipt, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';

const BLANK = { category: 'marketing', country: 'default', scope: 'default', baseCost: '', sellingPrice: '', taxPercent: 18 };

export default function PricingPage() {
  const [rows, setRows] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/pricing').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    if (!form.baseCost || !form.sellingPrice) { setError('Base cost and selling price are required'); return; }
    setSaving(true);
    try {
      await api.post('/pricing', {
        ...form,
        baseCost: Number(form.baseCost),
        sellingPrice: Number(form.sellingPrice),
        taxPercent: Number(form.taxPercent),
      });
      setModalOpen(false);
      setForm(BLANK);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save pricing rule');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this pricing rule?')) return;
    await api.delete(`/pricing/${id}`);
    await load();
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Message pricing"
        subtitle="Priority: client-specific → plan-specific → country-specific → default."
        action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New rule</Button>}
      />

      {!rows ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !rows.length ? (
        <Empty icon={Receipt} title="No pricing configured" description="Add a default rule for each message category." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r._id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge label={r.category} color="blue" />
                  <Badge label={r.scope} color="gray" />
                  <span className="text-xs text-muted-foreground">{r.country}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm">
                    <span className="text-muted-foreground">Cost </span>₹{r.baseCost}
                    <span className="text-muted-foreground"> → Sell </span>₹{r.sellingPrice}
                  </span>
                  <Badge label={r.isActive ? 'Active' : 'Inactive'} color={r.isActive ? 'green' : 'gray'} />
                  <button onClick={() => remove(r._id)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New pricing rule"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="marketing">Marketing</option>
            <option value="authentication">Authentication</option>
            <option value="utility">Utility</option>
            <option value="service">Service</option>
          </Select>
          <Select label="Scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <option value="default">Default (global fallback)</option>
            <option value="country">Country-specific</option>
          </Select>
          {form.scope === 'country' && (
            <Input label="Country code (e.g. IN, US)" value={form.country === 'default' ? '' : form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Base cost (INR)" type="number" step="0.001" value={form.baseCost}
              onChange={(e) => setForm({ ...form, baseCost: e.target.value })} />
            <Input label="Selling price (INR)" type="number" step="0.001" value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </div>
          <Input label="Tax %" type="number" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
