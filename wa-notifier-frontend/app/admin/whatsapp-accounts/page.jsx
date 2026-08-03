'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import api from '@/lib/api';
import {
  Activity, Building2, Loader2, MessageCircle, Pencil, Phone, Power,
  RefreshCw, ShieldCheck, Trash2, Wifi,
} from 'lucide-react';

const blankEdit = { name: '', wabaId: '', phoneNumberId: '', phone: '', timezone: '', industry: '', accessToken: '' };
const text = (value) => String(value || '').toLowerCase();
const tenantIdOf = (account) => String(account?.tenantId?._id || account?.tenantId || '');
const requiredMetaFields = ['wabaId', 'phoneNumberId'];

function qualityColor(rating) {
  if (rating === 'GREEN') return 'green';
  if (rating === 'YELLOW') return 'yellow';
  if (rating === 'RED') return 'red';
  return 'gray';
}

function HealthCell({ account, health }) {
  const phoneNumber = health?.phoneNumber;
  const missingMeta = requiredMetaFields.some((field) => !account?.[field]);
  const tokenLabel = health?.tokenStatus === 'ok'
    ? 'Token OK'
    : health?.tokenStatus === 'error'
      ? 'Token issue'
      : 'Token unchecked';
  const webhookLabel = health?.webhookStatus === 'ok'
    ? 'Webhook subscribed'
    : health?.webhookStatus === 'error'
      ? 'Webhook issue'
      : 'Webhook unchecked';

  return (
    <div className="flex max-w-[260px] flex-wrap gap-1.5">
      <Badge label={tokenLabel} color={health?.tokenStatus === 'ok' ? 'green' : health?.tokenStatus === 'error' ? 'red' : 'gray'} />
      <Badge label={webhookLabel} color={health?.webhookStatus === 'ok' ? 'green' : health?.webhookStatus === 'error' ? 'red' : 'gray'} />
      {missingMeta ? (
        <Badge label="Setup incomplete" color="yellow" />
      ) : phoneNumber ? (
        <>
          <Badge label={`Quality ${phoneNumber.quality_rating || 'Unknown'}`} color={qualityColor(phoneNumber.quality_rating)} />
          <Badge label={phoneNumber.code_verification_status || 'Phone checked'} color="green" />
        </>
      ) : health?.phoneStatus === 'error' ? (
        <Badge label="Phone issue" color="red" />
      ) : (
        <Badge label="Phone unchecked" color="gray" />
      )}
      {health?.diagnosticsAt && (
        <span className="basis-full text-xs text-muted-foreground">Last checked {new Date(health.diagnosticsAt).toLocaleString()}</span>
      )}
      {health?.error && (
        <span className="basis-full truncate text-xs text-destructive" title={health.error}>{health.error}</span>
      )}
    </div>
  );
}

export default function AdminWhatsAppAccountsPage() {
  const [accounts, setAccounts] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'account', direction: 'asc' });
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [healthById, setHealthById] = useState({});

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(blankEdit);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [pinTarget, setPinTarget] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  const [diagTarget, setDiagTarget] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagError, setDiagError] = useState('');

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 3500);
  };

  const load = async () => {
    setLoading(true);
    setActionError('');
    try {
      const [accountRes, tenantRes] = await Promise.all([
        api.get('/whatsapp-accounts'),
        api.get('/tenants').catch(() => ({ data: [] })),
      ]);
      setAccounts(Array.isArray(accountRes.data) ? accountRes.data : []);
      setTenants(Array.isArray(tenantRes.data) ? tenantRes.data : []);
    } catch (err) {
      setAccounts([]);
      setActionError(err?.response?.data?.message || 'Could not load WhatsApp accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tenantsById = useMemo(() => new Map(tenants.map((tenant) => [String(tenant._id), tenant])), [tenants]);

  const filteredAccounts = useMemo(() => {
    const query = text(search.trim());
    return (accounts || []).filter((account) => {
      const tenant = tenantsById.get(tenantIdOf(account));
      const matchesSearch = !query
        || text(account.name).includes(query)
        || text(account.phone).includes(query)
        || text(account.wabaId).includes(query)
        || text(account.phoneNumberId).includes(query)
        || text(account.industry).includes(query)
        || text(tenant?.name).includes(query)
        || text(tenant?.contactEmail).includes(query);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && account.isActive)
        || (statusFilter === 'inactive' && !account.isActive);
      const matchesTenant = tenantFilter === 'all'
        || (tenantFilter === 'unassigned' && !tenantIdOf(account))
        || tenantIdOf(account) === tenantFilter;
      return matchesSearch && matchesStatus && matchesTenant;
    });
  }, [accounts, search, statusFilter, tenantFilter, tenantsById]);

  const sortedAccounts = useMemo(() => sortItems(filteredAccounts, sort, {
    account: (account) => account.name,
    client: (account) => tenantsById.get(tenantIdOf(account))?.name,
    phone: (account) => account.phone,
    meta: (account) => account.wabaId || account.phoneNumberId,
    status: (account) => Boolean(account.isActive),
    health: (account) => healthById[account._id]?.tokenStatus || healthById[account._id]?.webhookStatus || '',
  }), [filteredAccounts, healthById, sort, tenantsById]);
  const accountsPage = usePagination(sortedAccounts, {
    initialPageSize: 10,
    resetKey: `${search}|${statusFilter}|${tenantFilter}|${sort.key}|${sort.direction}`,
  });

  const stats = useMemo(() => {
    const list = accounts || [];
    return {
      total: list.length,
      active: list.filter((account) => account.isActive).length,
      inactive: list.filter((account) => !account.isActive).length,
      tenants: new Set(list.map(tenantIdOf).filter(Boolean)).size,
      checked: list.filter((account) => healthById[account._id]?.diagnosticsAt).length,
    };
  }, [accounts, healthById]);

  const openEdit = (account) => {
    setEditForm({
      name: account.name || '',
      wabaId: account.wabaId || '',
      phoneNumberId: account.phoneNumberId || '',
      phone: account.phone || '',
      timezone: account.timezone || '',
      industry: account.industry || '',
      accessToken: '',
    });
    setEditError('');
    setEditTarget(account);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim() || !editForm.wabaId.trim() || !editForm.phoneNumberId.trim()) {
      setEditError('Display name, WABA ID, and phone number ID are required.');
      return;
    }
    setSavingEdit(true);
    setEditError('');
    try {
      const payload = Object.fromEntries(Object.entries(editForm).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
      if (!payload.accessToken) delete payload.accessToken;
      await api.patch(`/whatsapp-accounts/${editTarget._id}`, payload);
      setEditTarget(null);
      await load();
      flash('WhatsApp account updated');
    } catch (err) {
      setEditError(err?.response?.data?.message || 'Failed to update account');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (account) => {
    setBusyId(account._id);
    setActionError('');
    try {
      await api.patch(`/whatsapp-accounts/${account._id}`, { isActive: !account.isActive });
      await load();
      flash(account.isActive ? 'Account deactivated' : 'Account activated');
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to update account status');
    } finally {
      setBusyId(null);
    }
  };

  const subscribeWebhook = async (account) => {
    setBusyId(account._id);
    setActionError('');
    try {
      await api.post(`/whatsapp-accounts/${account._id}/webhooks/subscribe`);
      setHealthById((prev) => ({
        ...prev,
        [account._id]: {
          ...(prev[account._id] || {}),
          webhookStatus: 'ok',
          webhookCheckedAt: new Date().toISOString(),
          error: '',
        },
      }));
      flash('Webhook subscribed for ' + account.name);
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to subscribe webhook';
      setActionError(message);
      setHealthById((prev) => ({
        ...prev,
        [account._id]: {
          ...(prev[account._id] || {}),
          webhookStatus: 'error',
          error: message,
        },
      }));
    } finally {
      setBusyId(null);
    }
  };

  const openPinModal = (account) => {
    setPinTarget(account);
    setPin('');
    setPinError('');
  };

  const submitPin = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setPinError('PIN must be exactly 6 digits.');
      return;
    }
    setPinSaving(true);
    setPinError('');
    try {
      await api.post(`/whatsapp-accounts/${pinTarget._id}/register`, { pin });
      setPinTarget(null);
      flash('Phone number registered');
    } catch (err) {
      setPinError(err?.response?.data?.message || 'Failed to register phone number');
    } finally {
      setPinSaving(false);
    }
  };

  const openDiagnostics = async (account) => {
    setDiagTarget(account);
    setDiagResult(null);
    setDiagError('');
    setDiagLoading(true);
    try {
      const { data } = await api.get(`/whatsapp-accounts/${account._id}/sending-diagnostics`);
      setDiagResult(data);
      setHealthById((prev) => ({
        ...prev,
        [account._id]: {
          ...(prev[account._id] || {}),
          diagnosticsAt: new Date().toISOString(),
          tokenStatus: data?.phoneNumber ? 'ok' : 'error',
          phoneStatus: data?.phoneNumber ? 'ok' : 'error',
          phoneNumber: data?.phoneNumber || null,
          wabaPhoneNumbers: Array.isArray(data?.wabaPhoneNumbers) ? data.wabaPhoneNumbers : [],
          error: data?.error || data?.wabaPhoneNumbersError || '',
        },
      }));
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to run diagnostics';
      setDiagError(message);
      setHealthById((prev) => ({
        ...prev,
        [account._id]: {
          ...(prev[account._id] || {}),
          diagnosticsAt: new Date().toISOString(),
          tokenStatus: 'error',
          phoneStatus: 'error',
          error: message,
        },
      }));
    } finally {
      setDiagLoading(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setActionError('');
    try {
      await api.delete(`/whatsapp-accounts/${removeTarget._id}`);
      setRemoveTarget(null);
      await load();
      flash('WhatsApp account deleted');
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to remove account');
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="WhatsApp Accounts"
        subtitle="All connected WABAs and phone numbers across clients."
        action={<Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={14} />Refresh</Button>}
      />

      {notice && (
        <div className="soft-alert mb-5 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{notice}</div>
      )}
      {actionError && (
        <div className="soft-alert mb-5 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{actionError}</div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total accounts</p><p className="mt-1 text-2xl font-bold">{stats.total}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Inactive</p><p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{stats.inactive}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Health checked</p><p className="mt-1 text-2xl font-bold">{stats.checked}</p></Card>
      </div>

      {loading && !accounts ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : accounts?.length === 0 ? (
        <Empty icon={MessageCircle} title="No WhatsApp accounts connected" description="Connected WABAs and phone numbers will appear here after client onboarding." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[1fr_180px_220px]">
            <Input placeholder="Search client, WABA, phone, phone number ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
              <option value="all">All clients</option>
              <option value="unassigned">Unassigned</option>
              {tenants.map((tenant) => <option key={tenant._id} value={tenant._id}>{tenant.name}</option>)}
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Account" sortKey="account" sort={sort} onSort={setSort} />
                  <SortableTh label="Client" sortKey="client" sort={sort} onSort={setSort} />
                  <SortableTh label="Phone" sortKey="phone" sort={sort} onSort={setSort} />
                  <SortableTh label="Meta IDs" sortKey="meta" sort={sort} onSort={setSort} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                  <SortableTh label="Health" sortKey="health" sort={sort} onSort={setSort} />
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredAccounts.length && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No WhatsApp accounts match these filters.</td></tr>
                )}
                {accountsPage.pageItems.map((account) => {
                  const tenant = tenantsById.get(tenantIdOf(account));
                  const busy = busyId === account._id;
                  const health = healthById[account._id];
                  return (
                    <tr key={account._id} className="table-row-hover align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <MessageCircle size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{account.name || '-'}</p>
                            <p className="break-all text-xs text-muted-foreground">{account._id}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{account.industry || account.timezone || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {tenant ? (
                          <Link href={`/admin/tenants/${tenant._id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Building2 size={13} /> {tenant.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                        {tenant?.contactEmail && <p className="mt-1 text-xs text-muted-foreground">{tenant.contactEmail}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-1"><Phone size={13} />{account.phone || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="break-all"><span className="text-muted-foreground">WABA:</span> {account.wabaId || '-'}</p>
                        <p className="break-all"><span className="text-muted-foreground">Phone ID:</span> {account.phoneNumberId || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={account.isActive ? 'Active' : 'Inactive'} color={account.isActive ? 'green' : 'red'} />
                      </td>
                      <td className="px-4 py-3">
                        <HealthCell account={account} health={health} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => openEdit(account)}><Pencil size={13} />Edit</Button>
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => subscribeWebhook(account)}>
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}Subscribe
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openPinModal(account)}><ShieldCheck size={13} />Register</Button>
                          <Button variant="outline" size="sm" onClick={() => openDiagnostics(account)}><Activity size={13} />Diagnostics</Button>
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleActive(account)}>
                            <Power size={13} />{account.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setRemoveTarget(account)}>
                            <Trash2 size={13} />Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls {...accountsPage} onPageChange={accountsPage.setPage} onPageSizeChange={accountsPage.setPageSize} />
        </Card>
      )}

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit - ${editTarget?.name || ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</Button>
          </>
        )}
      >
        <div className="space-y-3">
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <Input label="Display name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input label="Display phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          <Input label="WABA ID" value={editForm.wabaId} onChange={(e) => setEditForm({ ...editForm, wabaId: e.target.value })} />
          <Input label="Phone number ID" value={editForm.phoneNumberId} onChange={(e) => setEditForm({ ...editForm, phoneNumberId: e.target.value })} />
          <Input label="Timezone" value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })} placeholder="Asia/Kolkata" />
          <Input label="Industry" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
          <Input label="Access token (leave blank to keep current)" type="password" value={editForm.accessToken} onChange={(e) => setEditForm({ ...editForm, accessToken: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={!!pinTarget}
        onClose={() => setPinTarget(null)}
        title={`Register phone number - ${pinTarget?.name || ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setPinTarget(null)}>Cancel</Button>
            <Button onClick={submitPin} disabled={pinSaving}>{pinSaving ? 'Registering...' : 'Register'}</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Enter the 6-digit PIN for this WhatsApp phone number.</p>
          {pinError && <p className="text-sm text-destructive">{pinError}</p>}
          <Input label="6-digit PIN" value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </div>
      </Modal>

      <Modal
        open={!!diagTarget}
        onClose={() => setDiagTarget(null)}
        title={`Diagnostics - ${diagTarget?.name || ''}`}
        footer={<Button variant="outline" onClick={() => setDiagTarget(null)}>Close</Button>}
      >
        {diagLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : diagError ? (
          <p className="text-sm text-destructive">{diagError}</p>
        ) : diagResult ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Phone number health</p>
              {diagResult.phoneNumber ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <p>Verified name: <span className="font-medium">{diagResult.phoneNumber.verified_name || '-'}</span></p>
                  <p>Display number: <span className="font-medium">{diagResult.phoneNumber.display_phone_number || '-'}</span></p>
                  <p className="flex items-center gap-1.5">Quality: <Badge color={qualityColor(diagResult.phoneNumber.quality_rating)} label={diagResult.phoneNumber.quality_rating || 'Unknown'} /></p>
                  <p>Verification: <span className="font-medium">{diagResult.phoneNumber.code_verification_status || '-'}</span></p>
                </div>
              ) : (
                <p className="text-destructive">{diagResult.error || 'Could not fetch phone number status from Meta.'}</p>
              )}
            </div>
            {!!diagResult.wabaPhoneNumbers?.length && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Numbers on this WABA</p>
                <div className="space-y-1.5">
                  {diagResult.wabaPhoneNumbers.map((number) => (
                    <div key={number.id} className="flex items-center justify-between gap-3">
                      <span>{number.display_phone_number || number.id}</span>
                      <Badge color={qualityColor(number.quality_rating)} label={number.quality_rating || 'Unknown'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diagResult.wabaPhoneNumbersError && <p className="text-xs text-destructive">{diagResult.wabaPhoneNumbersError}</p>}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Delete WhatsApp account"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemove} disabled={removing}>{removing ? 'Deleting...' : 'Delete'}</Button>
          </>
        )}
      >
        <p className="text-sm text-muted-foreground">
          Delete <strong>{removeTarget?.name}</strong> ({removeTarget?.phone || removeTarget?.phoneNumberId})? Broadcasts, templates, and inbox history tied to this number will remain.
        </p>
      </Modal>
    </AppShell>
  );
}
