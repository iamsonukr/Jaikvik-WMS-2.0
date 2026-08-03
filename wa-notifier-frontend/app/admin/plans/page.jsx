'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner, Textarea, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { Tags, Plus, Pencil, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import api from '@/lib/api';

const BLANK = {
  name: '', description: '', monthlyPrice: '', quarterlyPrice: '', yearlyPrice: '', currency: 'INR',
  taxPercent: 18, trialDays: 7, buttonText: 'Choose plan', isPopular: false,
  contactsLimit: '', teamMembersLimit: '', whatsappNumbersLimit: '', customFieldsLimit: '', tagsLimit: '',
  marketingRate: '', authenticationRate: '', utilityRate: '', serviceRate: '0',
  featuresText: '',
};
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value, currency = 'INR') => `${currency === 'INR' ? 'Rs. ' : `${currency} `}${Number(value || 0).toLocaleString('en-IN')}`;
const fmtLimit = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN') : String(value);
};
const featureLines = (features) => {
  if (Array.isArray(features)) return features.filter(Boolean);
  return Object.entries(features || {})
    .filter(([, value]) => value === true || typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => value === true ? key.replace(/([A-Z])/g, ' $1').toLowerCase() : `${key}: ${value}`);
};
const toFeatureArray = (value) => String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const fromLimit = (value) => value === undefined || value === null ? '' : String(value);
const fromRate = (value) => value === undefined || value === null ? '' : String(value);
const fromPrice = (price, cycle) => {
  if (typeof price === 'number') return cycle === 'quarterly' ? String(price) : '';
  return price?.[cycle] === undefined || price?.[cycle] === null ? '' : String(price[cycle]);
};
const toLimit = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const toRate = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const buildLimits = (form) => {
  const limits = {
    contacts: toLimit(form.contactsLimit),
    teamMembers: toLimit(form.teamMembersLimit),
    whatsappNumbers: toLimit(form.whatsappNumbersLimit),
    customFields: toLimit(form.customFieldsLimit),
    tags: toLimit(form.tagsLimit),
  };
  return Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== undefined));
};
const buildMessageRates = (form) => ({
  marketing: toRate(form.marketingRate),
  authentication: toRate(form.authenticationRate),
  utility: toRate(form.utilityRate),
  service: toRate(form.serviceRate),
});
const buildPrice = (form) => {
  const price = {
    monthly: toLimit(form.monthlyPrice),
    quarterly: toLimit(form.quarterlyPrice),
    yearly: toLimit(form.yearlyPrice),
  };
  return Object.values(price).some((value) => value !== null && value !== undefined) ? price : null;
};
const rateSummary = (plan) => {
  const rates = plan.messageRates || {};
  return [
    ['Marketing', rates.marketing],
    ['Auth', rates.authentication],
    ['Utility', rates.utility],
    ['Service', rates.service],
  ];
};
const priceRows = (plan) => {
  if (!plan.price) return [];
  const price = typeof plan.price === 'number' ? { quarterly: plan.price } : plan.price;
  return [
    ['Monthly', price.monthly],
    ['Quarterly', price.quarterly],
    ['Yearly', price.yearly],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
};
const primaryPrice = (plan) => {
  if (typeof plan.price === 'number') return plan.price;
  return plan.price?.quarterly ?? plan.price?.monthly ?? plan.price?.yearly ?? 0;
};

function PriceCell({ plan }) {
  const rows = priceRows(plan);

  if (!plan.price) {
    return <span className="text-sm font-medium text-muted-foreground">On request</span>;
  }

  if (!rows.length) {
    return <span className="text-sm font-medium text-muted-foreground">Not set</span>;
  }

  return (
    <div className="min-w-36 space-y-1.5">
      {rows.map(([cycle, value]) => (
        <div key={cycle} className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">{cycle}</span>
          <span className="whitespace-nowrap text-sm font-semibold">{fmtMoney(value, plan.currency)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });

  const load = () => api.get('/plans').then((r) => setPlans(r.data));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditingId(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (plan) => {
    setEditingId(plan._id);
    setForm({
      name: plan.name, description: plan.description || '',
      monthlyPrice: fromPrice(plan.price, 'monthly'),
      quarterlyPrice: fromPrice(plan.price, 'quarterly'),
      yearlyPrice: fromPrice(plan.price, 'yearly'),
      currency: plan.currency,
      taxPercent: plan.taxPercent, trialDays: plan.trialDays,
      buttonText: plan.buttonText, isPopular: plan.isPopular,
      contactsLimit: fromLimit(plan.contacts ?? plan.limits?.contacts),
      teamMembersLimit: fromLimit(plan.teamMembers ?? plan.limits?.teamMembers),
      whatsappNumbersLimit: fromLimit(plan.whatsappNumbers ?? plan.limits?.whatsappNumbers),
      customFieldsLimit: fromLimit(plan.customFields ?? plan.limits?.customFields),
      tagsLimit: fromLimit(plan.tags ?? plan.limits?.tags),
      marketingRate: fromRate(plan.messageRates?.marketing),
      authenticationRate: fromRate(plan.messageRates?.authentication),
      utilityRate: fromRate(plan.messageRates?.utility),
      serviceRate: fromRate(plan.messageRates?.service ?? 0),
      featuresText: featureLines(plan.features).join('\n'),
    });
    setModalOpen(true);
  };

  const save = async () => {
    setError('');
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const {
        featuresText,
        contactsLimit,
        teamMembersLimit,
        whatsappNumbersLimit,
        customFieldsLimit,
        tagsLimit,
        monthlyPrice,
        quarterlyPrice,
        yearlyPrice,
        ...rest
      } = form;
      const payload = {
        ...rest,
        contacts: toLimit(contactsLimit),
        teamMembers: toLimit(teamMembersLimit),
        whatsappNumbers: toLimit(whatsappNumbersLimit),
        customFields: toLimit(customFieldsLimit),
        tags: toLimit(tagsLimit),
        limits: buildLimits(form),
        messageRates: buildMessageRates(form),
        features: toFeatureArray(featuresText),
        price: buildPrice(form),
      };
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

  const toggleStatus = async (plan) => {
    const current = plan.status || 'active';
    const nextStatus = current === 'active' ? 'inactive' : 'active';
    await api.patch(`/plans/${plan._id}`, { status: nextStatus });
    await load();
  };

  const deletePlan = async (plan) => {
    setDeleteError('');
    if (!confirm(`Delete "${plan.name}"? This is permanent and only works for plans with no subscription history.`)) return;
    setDeletingId(plan._id);
    try {
      await api.delete(`/plans/${plan._id}`);
      await load();
    } catch (err) {
      setDeleteError(err?.response?.data?.message || 'Could not delete plan');
    } finally {
      setDeletingId('');
    }
  };

  const filteredPlans = useMemo(() => {
    const query = text(search.trim());
    return (plans || []).filter((plan) => {
      const matchesSearch = !query
        || text(plan.name).includes(query)
        || text(plan.description).includes(query)
        || text(plan.buttonText).includes(query)
        || featureLines(plan.features).some((feature) => text(feature).includes(query));
      const matchesStatus = statusFilter === 'all' || (plan.status || 'active') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [plans, search, statusFilter]);

  const sortedPlans = useMemo(() => sortItems(filteredPlans, sort, {
    name: (plan) => plan.name,
    price: primaryPrice,
    contacts: (plan) => plan.contacts ?? plan.limits?.contacts,
    team: (plan) => plan.teamMembers ?? plan.limits?.teamMembers,
    whatsapp: (plan) => plan.whatsappNumbers ?? plan.limits?.whatsappNumbers,
    customFields: (plan) => plan.customFields ?? plan.limits?.customFields,
    tags: (plan) => plan.tags ?? plan.limits?.tags,
    rates: (plan) => plan.messageRates?.marketing ?? 0,
    tax: (plan) => plan.taxPercent ?? 0,
    features: (plan) => featureLines(plan.features).length,
    status: (plan) => plan.status || 'active',
    button: (plan) => plan.buttonText,
  }), [filteredPlans, sort]);
  const plansPage = usePagination(sortedPlans, {
    initialPageSize: 10,
    resetKey: `${search}|${statusFilter}|${sort.key}|${sort.direction}`,
  });

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
          {deleteError && (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {deleteError}
            </div>
          )}
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_150px]">
            <Input placeholder="Search plans, descriptions, CTA..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <SortableTh label="Plan" sortKey="name" sort={sort} onSort={setSort} />
                  <SortableTh label="Price" sortKey="price" sort={sort} onSort={setSort} />
                  <SortableTh label="Contacts" sortKey="contacts" sort={sort} onSort={setSort} />
                  <SortableTh label="Team" sortKey="team" sort={sort} onSort={setSort} />
                  <SortableTh label="WhatsApp" sortKey="whatsapp" sort={sort} onSort={setSort} />
                  <SortableTh label="Custom Fields" sortKey="customFields" sort={sort} onSort={setSort} />
                  <SortableTh label="Tags" sortKey="tags" sort={sort} onSort={setSort} />
                  <SortableTh label="Message Rates" sortKey="rates" sort={sort} onSort={setSort} />
                  <SortableTh label="Tax / Trial" sortKey="tax" sort={sort} onSort={setSort} />
                  <SortableTh label="Features" sortKey="features" sort={sort} onSort={setSort} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                  <SortableTh label="Button" sortKey="button" sort={sort} onSort={setSort} />
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredPlans.length && (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">No plans match these filters.</td></tr>
                )}
                {plansPage.pageItems.map((plan) => (
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
                    <td className="px-4 py-3">
                      <PriceCell plan={plan} />
                    </td>
                    <td className="px-4 py-3">{fmtLimit(plan.contacts ?? plan.limits?.contacts)}</td>
                    <td className="px-4 py-3">{fmtLimit(plan.teamMembers ?? plan.limits?.teamMembers)}</td>
                    <td className="px-4 py-3">{fmtLimit(plan.whatsappNumbers ?? plan.limits?.whatsappNumbers)}</td>
                    <td className="px-4 py-3">{fmtLimit(plan.customFields ?? plan.limits?.customFields)}</td>
                    <td className="px-4 py-3">{fmtLimit(plan.tags ?? plan.limits?.tags)}</td>
                    <td className="px-4 py-3">
                      <div className="grid min-w-40 grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        {rateSummary(plan).map(([label, value]) => (
                          <p key={label}><span className="text-muted-foreground">{label}:</span> {fmtMoney(value || 0)}</p>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p>{plan.taxPercent ?? 0}% tax</p>
                      <p className="text-xs text-muted-foreground">{plan.trialDays ?? 0} trial days</p>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleStatus(plan)}
                          title={(plan.status || 'active') === 'active' ? 'Disable plan' : 'Activate plan'}
                        >
                          {(plan.status || 'active') === 'active' ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                          {(plan.status || 'active') === 'active' ? 'Disable' : 'Activate'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deletePlan(plan)}
                          disabled={deletingId === plan._id}
                          title="Delete plan"
                        >
                          <Trash2 size={13} />
                          {deletingId === plan._id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls {...plansPage} onPageChange={plansPage.setPage} onPageSizeChange={plansPage.setPageSize} />
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
          <Input label="Default currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Monthly price" type="number" min="0" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} />
            <Input label="Quarterly price" type="number" min="0" value={form.quarterlyPrice} onChange={(e) => setForm({ ...form, quarterlyPrice: e.target.value })} />
            <Input label="Yearly price" type="number" min="0" value={form.yearlyPrice} onChange={(e) => setForm({ ...form, yearlyPrice: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Tax %" type="number" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: Number(e.target.value) })} />
            <Input label="Trial days" type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contacts" type="number" min="0" value={form.contactsLimit} onChange={(e) => setForm({ ...form, contactsLimit: e.target.value })} />
            <Input label="Team members" type="number" min="0" value={form.teamMembersLimit} onChange={(e) => setForm({ ...form, teamMembersLimit: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="WhatsApp numbers" type="number" min="0" value={form.whatsappNumbersLimit} onChange={(e) => setForm({ ...form, whatsappNumbersLimit: e.target.value })} />
            <Input label="Custom fields" type="number" min="0" value={form.customFieldsLimit} onChange={(e) => setForm({ ...form, customFieldsLimit: e.target.value })} />
          </div>
          <Input label="Custom tags" type="number" min="0" value={form.tagsLimit} onChange={(e) => setForm({ ...form, tagsLimit: e.target.value })} />
          <div className="rounded-lg border border-border p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message rates by template category</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Marketing (INR)" type="number" min="0" step="0.001" value={form.marketingRate} onChange={(e) => setForm({ ...form, marketingRate: e.target.value })} />
              <Input label="Authentication (INR)" type="number" min="0" step="0.001" value={form.authenticationRate} onChange={(e) => setForm({ ...form, authenticationRate: e.target.value })} />
              <Input label="Utility (INR)" type="number" min="0" step="0.001" value={form.utilityRate} onChange={(e) => setForm({ ...form, utilityRate: e.target.value })} />
              <Input label="Service (INR)" type="number" min="0" step="0.001" value={form.serviceRate} onChange={(e) => setForm({ ...form, serviceRate: e.target.value })} />
            </div>
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
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
