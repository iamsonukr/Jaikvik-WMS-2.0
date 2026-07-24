'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner, Textarea } from '@/components/ui';
import { Tags, Plus, Pencil, EyeOff, Eye } from 'lucide-react';
import api from '@/lib/api';

const BLANK = {
  name: '', description: '', price: '', billingCycle: 'quarterly', currency: 'INR',
  taxPercent: 18, trialDays: 7, buttonText: 'Choose plan', isPopular: false, showOnWebsite: true,
  featuresText: '',
};
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value, currency = 'INR') => `${currency === 'INR' ? 'Rs. ' : `${currency} `}${Number(value || 0).toLocaleString('en-IN')}`;
const featureLines = (features) => {
  if (Array.isArray(features)) return features.filter(Boolean);
  return Object.entries(features || {})
    .filter(([, value]) => value === true || typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => value === true ? key.replace(/([A-Z])/g, ' $1').toLowerCase() : `${key}: ${value}`);
};
const toFeatureArray = (value) => String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export default function PlansPage() {
  const [plans, setPlans] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');

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
      featuresText: featureLines(plan.features).join('\n'),
    });
    setModalOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const { featuresText, ...rest } = form;
      const payload = { ...rest, features: toFeatureArray(featuresText), price: form.billingCycle === 'on_request' ? null : Number(form.price) };
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

  const filteredPlans = useMemo(() => {
    const query = text(search.trim());
    return (plans || []).filter((plan) => {
      const matchesSearch = !query
        || text(plan.name).includes(query)
        || text(plan.description).includes(query)
        || text(plan.buttonText).includes(query)
        || text(plan.billingCycle).includes(query)
        || featureLines(plan.features).some((feature) => text(feature).includes(query));
      const matchesCycle = cycleFilter === 'all' || plan.billingCycle === cycleFilter;
      const matchesStatus = statusFilter === 'all' || (plan.status || 'active') === statusFilter;
      const matchesVisibility = visibilityFilter === 'all'
        || (visibilityFilter === 'website' && plan.showOnWebsite)
        || (visibilityFilter === 'hidden' && !plan.showOnWebsite)
        || (visibilityFilter === 'popular' && plan.isPopular);
      return matchesSearch && matchesCycle && matchesStatus && matchesVisibility;
    });
  }, [plans, search, cycleFilter, statusFilter, visibilityFilter]);

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
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_160px_150px_170px]">
            <Input placeholder="Search plans, descriptions, CTA..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
              <option value="all">All cycles</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="on_request">On request</option>
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}>
              <option value="all">All visibility</option>
              <option value="website">On website</option>
              <option value="hidden">Hidden</option>
              <option value="popular">Popular</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Cycle</th>
                  <th className="px-4 py-3 font-semibold">Tax / Trial</th>
                  <th className="px-4 py-3 font-semibold">Website</th>
                  <th className="px-4 py-3 font-semibold">Features</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Button</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredPlans.length && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No plans match these filters.</td></tr>
                )}
                {filteredPlans.map((plan) => (
                  <tr key={plan._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{plan.name}</p>
                          {plan.isPopular && <Badge label="Popular" color="blue" />}
                        </div>
                        <p className="max-w-xs truncate text-xs text-muted-foreground">{plan.description || '-'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {plan.billingCycle === 'on_request' ? 'On request' : fmtMoney(plan.price, plan.currency)}
                    </td>
                    <td className="px-4 py-3 capitalize">{String(plan.billingCycle || '-').replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <p>{plan.taxPercent ?? 0}% tax</p>
                      <p className="text-xs text-muted-foreground">{plan.trialDays ?? 0} trial days</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={plan.showOnWebsite ? 'On website' : 'Hidden'} color={plan.showOnWebsite ? 'blue' : 'gray'} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-muted-foreground">{featureLines(plan.features).length} feature(s)</p>
                      <p className="max-w-xs truncate text-xs text-muted-foreground">{featureLines(plan.features)[0] || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={plan.status || 'active'} color={(plan.status || 'active') === 'active' ? 'green' : 'gray'} />
                    </td>
                    <td className="px-4 py-3">{plan.buttonText || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>
                          <Pencil size={13} /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleWebsite(plan)} title="Toggle website visibility">
                          {plan.showOnWebsite ? <EyeOff size={13} /> : <Eye size={13} />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit plan' : 'New plan'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save plan'}</Button>
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
          <Textarea
            label="Features"
            rows={7}
            value={form.featuresText}
            onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
            placeholder={'One feature per line\nShared Team Inbox\nBulk WhatsApp campaigns\n30 Custom Tags'}
          />
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
