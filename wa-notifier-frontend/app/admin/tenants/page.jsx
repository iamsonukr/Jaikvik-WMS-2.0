'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner, Textarea } from '@/components/ui';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };
const blankForm = {
  name: '',
  contactEmail: '',
  contactPhone: '',
  contactPerson: '',
  billingEmail: '',
  website: '',
  taxId: '',
  industry: '',
  timezone: 'Asia/Kolkata',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  country: 'India',
  postalCode: '',
  notes: '',
};
const text = (value) => String(value || '').toLowerCase();
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';

export default function TenantsPage() {
  const [tenants, setTenants] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  const load = () => api.get('/tenants').then((r) => setTenants(r.data));
  useEffect(() => { load(); }, []);

  const createTenant = async () => {
    setError('');
    if (!form.name || !form.contactEmail) { setError('Name and contact email are required'); return; }
    setSaving(true);
    try {
      await api.post('/tenants', form);
      setCreateOpen(false);
      setForm(blankForm);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create client');
    } finally {
      setSaving(false);
    }
  };

  const planOptions = useMemo(() => {
    const plans = (tenants || []).map((t) => t.planId?.name).filter(Boolean);
    return Array.from(new Set(plans)).sort();
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    const query = text(search.trim());
    return (tenants || []).filter((t) => {
      const matchesSearch = !query
        || text(t.name).includes(query)
        || text(t.contactEmail).includes(query)
        || text(t.contactPhone).includes(query)
        || text(t.industry).includes(query)
        || text(t.planId?.name).includes(query);
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesPlan = planFilter === 'all' || t.planId?.name === planFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [tenants, search, statusFilter, planFilter]);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Clients"
        subtitle="Every tenant onboarded to the platform."
        action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Add client</Button>}
      />

      {!tenants ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !tenants.length ? (
        <Empty icon={Building2} title="No clients yet" description="Add your first client to get started." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px_180px]">
            <Input placeholder="Search name, email, phone, industry..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </Select>
            <Select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <option value="all">All plans</option>
              {planOptions.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Industry</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredTenants.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No clients match these filters.</td></tr>
                )}
                {filteredTenants.map((t) => (
                  <tr key={t._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                          {t.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{t._id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p>{t.contactEmail || '-'}</p>
                      <p className="text-xs text-muted-foreground">{t.contactPhone || '-'}</p>
                    </td>
                    <td className="px-4 py-3">{t.industry || '-'}</td>
                    <td className="px-4 py-3">{t.planId?.name ? <Badge label={t.planId.name} color="blue" /> : '-'}</td>
                    <td className="px-4 py-3"><Badge label={t.status} color={STATUS_COLOR[t.status] || 'gray'} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/tenants/${t._id}`} className="inline-flex items-center justify-end text-primary hover:underline">
                        Details <ArrowRight size={14} className="ml-1" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add a new client"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createTenant} disabled={saving}>{saving ? 'Creating…' : 'Create client'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Client / company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <Input label="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <Input label="Billing email" type="email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} />
            <Input label="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <Input label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            <Input label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            <Input label="GST / Tax ID" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            <Input label="Postal code" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          </div>
          <Input label="Address line 1" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          <Input label="Address line 2" value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <Input label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
