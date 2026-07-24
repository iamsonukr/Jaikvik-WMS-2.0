'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner } from '@/components/ui';
import { Receipt, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';

const BLANK = { category: 'marketing', country: 'default', scope: 'default', baseCost: '', sellingPrice: '', taxPercent: 18 };
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })}`;

export default function PricingPage() {
  const [rows, setRows] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => api.get('/pricing').then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    if (!form.baseCost || !form.sellingPrice) { setError('Base cost and selling price are required'); return; }
    setSaving(true);
    try {
      await api.post('/pricing', {
        ...form,
        country: form.scope === 'country' ? form.country : 'default',
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

  const filteredRows = useMemo(() => {
    const query = text(search.trim());
    return (rows || []).filter((r) => {
      const matchesSearch = !query
        || text(r.category).includes(query)
        || text(r.scope).includes(query)
        || text(r.country).includes(query)
        || text(r.planId?.name).includes(query)
        || text(r.tenantId?.name).includes(query);
      const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
      const matchesScope = scopeFilter === 'all' || r.scope === scopeFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && r.isActive)
        || (statusFilter === 'inactive' && !r.isActive);
      return matchesSearch && matchesCategory && matchesScope && matchesStatus;
    });
  }, [rows, search, categoryFilter, scopeFilter, statusFilter]);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Message pricing"
        subtitle="Priority: client-specific, plan-specific, country-specific, then default."
        action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> New rule</Button>}
      />

      {!rows ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !rows.length ? (
        <Empty icon={Receipt} title="No pricing configured" description="Add a default rule for each message category." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_170px_150px_150px]">
            <Input placeholder="Search category, country, client, plan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              <option value="marketing">Marketing</option>
              <option value="authentication">Authentication</option>
              <option value="utility">Utility</option>
              <option value="service">Service</option>
            </Select>
            <Select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
              <option value="all">All scopes</option>
              <option value="default">Default</option>
              <option value="country">Country</option>
              <option value="plan">Plan</option>
              <option value="tenant">Client</option>
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
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Scope</th>
                  <th className="px-4 py-3 font-semibold">Country</th>
                  <th className="px-4 py-3 font-semibold">Client / Plan</th>
                  <th className="px-4 py-3 text-right font-semibold">Base cost</th>
                  <th className="px-4 py-3 text-right font-semibold">Selling</th>
                  <th className="px-4 py-3 text-right font-semibold">Margin</th>
                  <th className="px-4 py-3 font-semibold">Tax</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredRows.length && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No pricing rules match these filters.</td></tr>
                )}
                {filteredRows.map((r) => {
                  const margin = Number(r.sellingPrice || 0) - Number(r.baseCost || 0);
                  return (
                    <tr key={r._id} className="table-row-hover">
                      <td className="px-4 py-3"><Badge label={r.category} color="blue" /></td>
                      <td className="px-4 py-3"><Badge label={r.scope} color="gray" /></td>
                      <td className="px-4 py-3 uppercase">{r.country || 'default'}</td>
                      <td className="px-4 py-3">
                        <p>{r.tenantId?.name || r.planId?.name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{r.tenantId?._id || r.planId?._id || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-right">{fmtMoney(r.baseCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtMoney(r.sellingPrice)}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(margin)}</td>
                      <td className="px-4 py-3">{r.taxPercent ?? 0}%</td>
                      <td className="px-4 py-3">
                        <Badge label={r.isActive ? 'Active' : 'Inactive'} color={r.isActive ? 'green' : 'gray'} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => remove(r._id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500" aria-label="Delete pricing rule">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New pricing rule"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save rule'}</Button>
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
