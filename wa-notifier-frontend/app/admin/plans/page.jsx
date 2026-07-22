'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner } from '@/components/ui';
import { Tags, Plus, Pencil, EyeOff, Eye } from 'lucide-react';
import api from '@/lib/api';

const BLANK = {
  name: '', description: '', price: '', billingCycle: 'quarterly', currency: 'INR',
  taxPercent: 18, trialDays: 7, buttonText: 'Choose plan', isPopular: false, showOnWebsite: true,
};

export default function PlansPage() {
  const [plans, setPlans] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/plans').then((r) => setPlans(r.data));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditingId(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (plan) => {
    setEditingId(plan._id);
    setForm({
      name: plan.name, description: plan.description || '',
      price: plan.price ?? '', billingCycle: plan.billingCycle, currency: plan.currency,
      taxPercent: plan.taxPercent, trialDays: plan.trialDays,
      buttonText: plan.buttonText, isPopular: plan.isPopular, showOnWebsite: plan.showOnWebsite,
    });
    setModalOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, price: form.billingCycle === 'on_request' ? null : Number(form.price) };
      if (editingId) await api.patch(`/plans/${editingId}`, payload);
      else await api.post('/plans', payload);
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save plan');
    } finally {
      setSaving(false);
    }
  };

  const toggleWebsite = async (plan) => {
    await api.patch(`/plans/${plan._id}`, { showOnWebsite: !plan.showOnWebsite });
    await load();
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Plans"
        subtitle="Pricing shown on the public site and available to assign to clients."
        action={<Button onClick={openCreate}><Plus size={16} /> New plan</Button>}
      />

      {!plans ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !plans.length ? (
        <Empty icon={Tags} title="No plans yet" description="Create your first plan to publish pricing." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <Card key={plan._id} className="flex flex-col p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{plan.name}</h3>
                {plan.isPopular && <Badge label="Popular" color="blue" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
              <p className="mt-3 text-2xl font-bold">
                {plan.billingCycle === 'on_request' ? 'On request' : `₹${plan.price?.toLocaleString('en-IN')}`}
              </p>
              <p className="text-xs text-muted-foreground">{plan.billingCycle}</p>
              <div className="mt-4 flex items-center gap-2">
                <Badge label={plan.status} color={plan.status === 'active' ? 'green' : 'gray'} />
                <Badge label={plan.showOnWebsite ? 'On website' : 'Hidden'} color={plan.showOnWebsite ? 'blue' : 'gray'} />
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                  <Pencil size={13} /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleWebsite(plan)} title="Toggle website visibility">
                  {plan.showOnWebsite ? <EyeOff size={13} /> : <Eye size={13} />}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit plan' : 'New plan'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save plan'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Billing cycle" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="on_request">On request (Enterprise)</option>
            </Select>
            <Input label="Price (INR)" type="number" disabled={form.billingCycle === 'on_request'}
              value={form.billingCycle === 'on_request' ? '' : form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tax %" type="number" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })} />
            <Input label="Trial days" type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} />
          </div>
          <Input label="Button text" value={form.buttonText} onChange={(e) => setForm({ ...form, buttonText: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isPopular} onChange={(e) => setForm({ ...form, isPopular: e.target.checked })} />
            Mark as popular
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.showOnWebsite} onChange={(e) => setForm({ ...form, showOnWebsite: e.target.checked })} />
            Show on public pricing page
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
