'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import {
  PageHeader, StatCard, Card, CardHeader, Spinner, Empty, Input, Select, Button,
  Badge, SortableTh, PaginationControls, sortItems, usePagination, Modal, Textarea,
} from '@/components/ui';
import { BarChart3, IndianRupee, Landmark, Pencil, ReceiptText, RefreshCw, Search } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import api from '@/lib/api';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };
const PRICE_CATEGORIES = [
  ['marketing', 'Marketing'],
  ['utility', 'Utility'],
  ['authentication', 'Authentication'],
  ['service', 'Service'],
];

const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => value === null || value === undefined ? '-' : `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const fmtPercent = (value) => value === null || value === undefined ? '-' : `${Number(value).toLocaleString('en-IN')}%`;
const fmtDate = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';
const fmtRate = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className="font-medium text-foreground">{fmtMoney(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminExpensesPage() {
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState('month');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [syncFilter, setSyncFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'clientRevenue', direction: 'desc' });
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [manualTarget, setManualTarget] = useState(null);
  const [manualForm, setManualForm] = useState({ accountId: '', metaChargedAmount: '', metaInvoiceId: '', notes: '' });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [clientDetail, setClientDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadSummary = () => {
    setSummary(null);
    setError('');
    return api.get(`/expenses/admin/summary?period=${period}`)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Could not load expenses.'));
  };

  useEffect(() => {
    loadSummary();
  }, [period]);

  const syncMetaExpenses = async () => {
    setSyncing(true);
    setError('');
    setSyncResult(null);
    try {
      const { data } = await api.post(`/expenses/admin/sync?period=${period}`);
      setSyncResult(data);
      setSummary(data.summary);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not sync Meta pricing analytics.');
    } finally {
      setSyncing(false);
    }
  };

  const openManualCost = (row) => {
    const account = row.accounts?.[0];
    setManualTarget(row);
    setManualError('');
    setManualForm({
      accountId: account?.id || '',
      metaChargedAmount: String(account?.metaCostSnapshot?.amount ?? (row.metaCharged || row.expectedMetaCost || '')),
      metaInvoiceId: account?.metaCostSnapshot?.metaInvoiceId || '',
      notes: account?.metaCostSnapshot?.notes || '',
    });
  };

  const selectedManualAccount = useMemo(() => (
    manualTarget?.accounts?.find((account) => account.id === manualForm.accountId) || manualTarget?.accounts?.[0] || null
  ), [manualTarget, manualForm.accountId]);

  const updateManualAccount = (accountId) => {
    const account = manualTarget?.accounts?.find((item) => item.id === accountId);
    setManualForm((prev) => ({
      ...prev,
      accountId,
      metaChargedAmount: String(account?.metaCostSnapshot?.amount ?? (manualTarget?.expectedMetaCost || '')),
      metaInvoiceId: account?.metaCostSnapshot?.metaInvoiceId || '',
      notes: account?.metaCostSnapshot?.notes || '',
    }));
  };

  const saveManualCost = async () => {
    if (!manualTarget || !manualForm.accountId) return;
    setManualSaving(true);
    setManualError('');
    try {
      const { data } = await api.post(`/expenses/admin/manual?period=${period}`, {
        tenantId: manualTarget.tenantId,
        whatsappAccountId: manualForm.accountId,
        metaChargedAmount: Number(manualForm.metaChargedAmount),
        currency: 'INR',
        metaInvoiceId: manualForm.metaInvoiceId,
        notes: manualForm.notes,
      });
      setSummary(data.summary);
      setManualTarget(null);
      setSyncResult({ synced: 0, failed: 0, skipped: 0, failures: [], manualSaved: true });
    } catch (err) {
      setManualError(err?.response?.data?.message || 'Could not save manual Meta cost.');
    } finally {
      setManualSaving(false);
    }
  };

  const rows = summary?.rows || [];
  const selectedClient = rows.find((row) => row.tenantId === selectedTenantId) || null;

  useEffect(() => {
    if (!rows.length) {
      setSelectedTenantId('');
      return;
    }
    if (!rows.some((row) => row.tenantId === selectedTenantId)) {
      setSelectedTenantId(rows[0].tenantId);
      setSelectedAccountId('all');
    }
  }, [rows, selectedTenantId]);

  useEffect(() => {
    if (selectedAccountId !== 'all' && !selectedClient?.accounts?.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId('all');
    }
  }, [selectedClient, selectedAccountId]);

  useEffect(() => {
    if (!selectedTenantId || !summary) {
      setClientDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError('');
    const accountQuery = selectedAccountId === 'all' ? '' : `&accountId=${encodeURIComponent(selectedAccountId)}`;
    api.get(`/expenses/admin/client-detail?period=${period}&tenantId=${encodeURIComponent(selectedTenantId)}${accountQuery}`)
      .then((res) => { if (active) setClientDetail(res.data); })
      .catch((err) => {
        if (!active) return;
        setClientDetail(null);
        setDetailError(err?.response?.data?.message || 'Could not load client expense details.');
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [period, selectedTenantId, selectedAccountId, summary]);

  const selectClient = (tenantId) => {
    setSelectedTenantId(tenantId);
    setSelectedAccountId('all');
  };
  const filteredRows = useMemo(() => {
    const query = text(search.trim());
    return rows.filter((row) => {
      const accountText = row.accounts?.map((account) => `${account.name} ${account.wabaId} ${account.phone}`).join(' ') || '';
      const matchesSearch = !query
        || text(row.clientName).includes(query)
        || text(row.contactEmail).includes(query)
        || text(row.planName).includes(query)
        || text(accountText).includes(query);
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchesSync = syncFilter === 'all'
        || (syncFilter === 'synced' && row.hasMetaCost)
        || (syncFilter === 'unsynced' && !row.hasMetaCost);
      return matchesSearch && matchesStatus && matchesSync;
    });
  }, [rows, search, statusFilter, syncFilter]);

  const sortedRows = useMemo(() => sortItems(filteredRows, sort, {
    client: (row) => row.clientName,
    accounts: (row) => row.accounts?.length || 0,
    clientRevenue: (row) => row.clientRevenue,
    metaCharged: (row) => row.hasMetaCost ? row.metaCharged : -1,
    expectedMetaCost: (row) => row.expectedMetaCost,
    margin: (row) => row.margin ?? -1,
    expectedMargin: (row) => row.expectedMargin ?? -1,
    marginPercent: (row) => row.marginPercent ?? -1,
    billableEntries: (row) => row.billableEntries,
    expectedBillableMessages: (row) => row.expectedBillableMessages,
    sync: (row) => row.hasMetaCost ? 1 : 0,
    status: (row) => row.status,
  }), [filteredRows, sort]);
  const expensesPage = usePagination(sortedRows, {
    initialPageSize: 10,
    resetKey: `${period}|${search}|${statusFilter}|${syncFilter}|${sort.key}|${sort.direction}`,
  });

  const chartRows = useMemo(() => (
    [...rows]
      .filter((row) => row.clientRevenue > 0 || row.metaCharged > 0)
      .sort((a, b) => b.clientRevenue - a.clientRevenue)
      .slice(0, 8)
      .map((row) => ({
        name: row.clientName,
        clientRevenue: row.clientRevenue,
        metaCharged: row.hasMetaCost ? row.metaCharged : 0,
        expectedMetaCost: row.expectedMetaCost || 0,
      }))
  ), [rows]);

  const metaRates = summary?.metaPricing?.rates || {};

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Expenses"
        subtitle="Reconcile client message revenue against Meta charges per WhatsApp Business Account."
        action={(
          <>
            <Button onClick={syncMetaExpenses} disabled={syncing || period === 'all'} title={period === 'all' ? 'Choose this month or this year to sync Meta costs' : undefined}>
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Meta'}
            </Button>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44">
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
            </Select>
          </>
        )}
      />

      {error && <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {syncResult && (
        <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <p className="font-medium">
            {syncResult.manualSaved
              ? 'Manual Meta cost saved.'
              : `Meta sync completed: ${syncResult.synced} synced, ${syncResult.failed} failed, ${syncResult.skipped} skipped.`}
          </p>
          {!!syncResult.failures?.length && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {syncResult.failures.slice(0, 5).map((failure) => (
                <p key={`${failure.wabaId}-${failure.message}`}>
                  <span className="font-mono">{failure.wabaId}</span>: {failure.message}
                </p>
              ))}
              {syncResult.failures.length > 5 && <p>{syncResult.failures.length - 5} more failure(s).</p>}
            </div>
          )}
        </div>
      )}

      {!summary ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Client message revenue" value={fmtMoney(summary.totals.clientRevenue)} icon={IndianRupee} color="#16a34a" sub="Wallet debits minus refunds" />
            <StatCard label="Meta charges synced" value={fmtMoney(summary.totals.metaCharged)} icon={Landmark} color="#dc2626" sub="Actual cost snapshots" />
            <StatCard label="Expected Meta cost" value={fmtMoney(summary.totals.expectedMetaCost)} icon={ReceiptText} color="#7c3aed" sub={`${fmtMoney(summary.totals.expectedMetaSubtotal)} + ${fmtMoney(summary.totals.expectedMetaTax)} GST`} />
            <StatCard label="Expected margin" value={fmtMoney(summary.totals.expectedMargin)} icon={BarChart3} color="#2563eb" sub="Client revenue minus expected Meta cost" />
          </div>

          <Card className="mb-6 overflow-hidden p-0">
            <div className="border-b border-border p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_auto] lg:items-end">
                <Select label="Client account" value={selectedTenantId} onChange={(e) => selectClient(e.target.value)}>
                  {rows.map((row) => (
                    <option key={row.tenantId} value={row.tenantId}>{row.clientName} - {row.contactEmail || 'No email'}</option>
                  ))}
                </Select>
                <Select
                  label="WhatsApp account"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  disabled={!selectedClient?.accounts?.length}
                >
                  <option value="all">All WhatsApp accounts</option>
                  {selectedClient?.accounts?.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} - {account.phone || account.wabaId}</option>
                  ))}
                </Select>
                {selectedClient && (
                  <Button variant="outline" onClick={() => openManualCost(selectedClient)} disabled={!selectedClient.accounts?.length || period === 'all'}>
                    <Pencil size={15} />Update Meta cost
                  </Button>
                )}
              </div>
            </div>

            {detailError && <p className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{detailError}</p>}
            {detailLoading ? (
              <div className="flex justify-center py-14"><Spinner /></div>
            ) : clientDetail ? (
              <>
                <div className="grid border-b border-border sm:grid-cols-2 xl:grid-cols-6">
                  {[
                    ['Client total charged', fmtMoney(clientDetail.totals.clientSpend)],
                    ['Client subtotal', fmtMoney(clientDetail.totals.clientSubtotal)],
                    ['Total client GST', fmtMoney(clientDetail.totals.clientTax)],
                    ['Wallet debits', fmtMoney(clientDetail.totals.walletDebits)],
                    ['Refunds', fmtMoney(clientDetail.totals.refunds)],
                    ['Actual Meta charge', fmtMoney(clientDetail.totals.actualMetaCharged)],
                    [`Expected Meta GST (${clientDetail.totals.expectedMetaTaxPercent}%)`, fmtMoney(clientDetail.totals.expectedMetaTax)],
                    ['Expected Meta cost', fmtMoney(clientDetail.totals.expectedMetaCost)],
                    ['Pre-GST margin', fmtMoney(clientDetail.totals.expectedMargin)],
                    ['Billable messages', Number(clientDetail.totals.billableMessages || 0).toLocaleString('en-IN')],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b border-border px-4 py-3 last:border-b-0 sm:border-r xl:border-b-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="border-b border-border p-4">
                  <div className="flex flex-wrap gap-3">
                    {clientDetail.accounts.map((account) => (
                      <div key={account.id} className="min-w-64 flex-1 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{account.name}</p>
                            <p className="text-xs text-muted-foreground">{account.phone || account.phoneNumberId || '-'}</p>
                            <p className="font-mono text-xs text-muted-foreground">WABA {account.wabaId}</p>
                          </div>
                          <Badge label={account.isActive ? 'Active' : 'Inactive'} color={account.isActive ? 'green' : 'gray'} />
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-2">
                          <div><p className="text-xs text-muted-foreground">Actual Meta charge</p><p className="font-semibold">{account.snapshots.length ? fmtMoney(account.metaCharged) : 'Not recorded'}</p></div>
                          <p className="text-right text-xs text-muted-foreground">{account.snapshots[0] ? `${account.snapshots[0].source === 'manual' ? 'Manual' : 'Meta API'} | ${fmtDate(account.snapshots[0].syncedAt)}` : 'No snapshot'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-4 py-3">
                  <h2 className="text-sm font-semibold">Broadcast spending</h2>
                  <p className="text-xs text-muted-foreground">Campaign-level wallet spend, refunds, Meta cost estimate, pricing, tax, and delivery results.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Broadcast</th>
                        <th className="px-4 py-3 font-semibold">Account</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 text-right font-semibold">Messages</th>
                        <th className="px-4 py-3 text-right font-semibold">Client spend</th>
                        <th className="px-4 py-3 text-right font-semibold">Debit / refund</th>
                        <th className="px-4 py-3 text-right font-semibold">Expected Meta</th>
                        <th className="px-4 py-3 text-right font-semibold">Pre-GST margin</th>
                        <th className="px-4 py-3 text-right font-semibold">Unit price / tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {!clientDetail.broadcasts.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No broadcasts found for this account and period.</td></tr>}
                      {clientDetail.broadcasts.map((broadcast) => (
                        <tr key={broadcast.id} className="table-row-hover">
                          <td className="px-4 py-3">
                            <p className="font-medium">{broadcast.name}</p>
                            <p className="text-xs text-muted-foreground">{broadcast.templateName} | {fmtDate(broadcast.createdAt)}</p>
                          </td>
                          <td className="px-4 py-3"><p>{broadcast.accountName}</p><p className="font-mono text-xs text-muted-foreground">{broadcast.wabaId}</p></td>
                          <td className="px-4 py-3"><Badge label={broadcast.status || 'unknown'} color={broadcast.status === 'done' ? 'green' : broadcast.status === 'failed' ? 'red' : 'blue'} /></td>
                          <td className="px-4 py-3 text-right"><p className="font-medium">{broadcast.billableMessages.toLocaleString('en-IN')} billed</p><p className="text-xs text-muted-foreground">{broadcast.deliveredCount} delivered | {broadcast.readCount} read | {broadcast.failedCount} failed</p></td>
                          <td className="px-4 py-3 text-right"><p className="font-semibold">{fmtMoney(broadcast.clientSpend)}</p><p className="text-xs text-muted-foreground">{fmtMoney(broadcast.clientSubtotal)} + {fmtMoney(broadcast.clientTax)} GST</p></td>
                          <td className="px-4 py-3 text-right"><p>{fmtMoney(broadcast.walletDebits)}</p><p className="text-xs text-muted-foreground">Refund {fmtMoney(broadcast.refunds)} | Reserved {fmtMoney(broadcast.reservedAmount)}</p></td>
                          <td className="px-4 py-3 text-right"><p>{fmtMoney(broadcast.expectedMetaCost)}</p><p className="text-xs text-muted-foreground">{fmtMoney(broadcast.expectedMetaSubtotal)} + {fmtMoney(broadcast.expectedMetaTax)} GST</p></td>
                          <td className={`px-4 py-3 text-right font-semibold ${broadcast.expectedMargin < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmtMoney(broadcast.expectedMargin)}</td>
                          <td className="px-4 py-3 text-right"><p>{fmtRate(broadcast.appliedUnitPrice)}</p><p className="text-xs text-muted-foreground">{broadcast.taxPercent}% tax | {broadcast.messageCategory}</p></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">Individual message spending</h2>
                  <p className="text-xs text-muted-foreground">Templates and service messages sent directly to one recipient, outside a broadcast.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Recipient</th>
                        <th className="px-4 py-3 font-semibold">Template / message</th>
                        <th className="px-4 py-3 font-semibold">Account</th>
                        <th className="px-4 py-3 font-semibold">Delivery</th>
                        <th className="px-4 py-3 text-right font-semibold">Client charge</th>
                        <th className="px-4 py-3 text-right font-semibold">Expected Meta</th>
                        <th className="px-4 py-3 text-right font-semibold">Pre-GST margin</th>
                        <th className="px-4 py-3 text-right font-semibold">Unit price / tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {!clientDetail.individualMessages?.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No individual outbound messages found for this account and period.</td></tr>}
                      {clientDetail.individualMessages?.map((message) => (
                        <tr key={message.id} className="table-row-hover">
                          <td className="px-4 py-3"><p className="font-medium">{message.contactName || message.phone}</p><p className="text-xs text-muted-foreground">{message.phone}</p></td>
                          <td className="px-4 py-3"><p className="font-medium">{message.templateName || message.type}</p><p className="max-w-64 truncate text-xs text-muted-foreground">{message.messageCategory}{message.languageCode ? ` | ${message.languageCode}` : ''}</p></td>
                          <td className="px-4 py-3"><p>{message.accountName}</p><p className="font-mono text-xs text-muted-foreground">{message.wabaId}</p></td>
                          <td className="px-4 py-3"><Badge label={message.deliveryStatus} color={message.isMetaBillable ? 'green' : message.deliveryStatus === 'failed' ? 'red' : 'yellow'} /><p className="mt-1 text-xs text-muted-foreground">{fmtDate(message.sentAt)}</p></td>
                          <td className="px-4 py-3 text-right"><p className="font-semibold">{fmtMoney(message.clientSpend)}</p><p className="text-xs text-muted-foreground">{fmtMoney(message.clientSubtotal)} + {fmtMoney(message.clientTax)} GST</p></td>
                          <td className="px-4 py-3 text-right"><p>{fmtMoney(message.expectedMetaCost)}</p><p className="text-xs text-muted-foreground">{message.isMetaBillable ? `${fmtMoney(message.expectedMetaSubtotal)} + ${fmtMoney(message.expectedMetaTax)} GST` : 'Not delivered'}</p></td>
                          <td className={`px-4 py-3 text-right font-semibold ${message.expectedMargin < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmtMoney(message.expectedMargin)}</td>
                          <td className="px-4 py-3 text-right"><p>{fmtRate(message.appliedUnitPrice)}</p><p className="text-xs text-muted-foreground">{message.taxPercent}% tax</p></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-5"><Empty icon={ReceiptText} title="Select a client" description="Choose a client and WhatsApp account to inspect expenses." /></div>
            )}
          </Card>

          <div className="mb-6 grid gap-5 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader title="Revenue vs Meta charges" subtitle="Top clients by message revenue" />
              {!chartRows.length ? (
                <div className="px-5 pb-5"><Empty icon={ReceiptText} title="No usage yet" description="Client usage and synced Meta expenses will appear here." /></div>
              ) : (
                <div className="h-80 p-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ left: 0, right: 8, bottom: 18 }}>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} opacity={0.7} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={58} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} />
                      <Legend iconType="circle" iconSize={8} />
                      <Bar dataKey="clientRevenue" name="Client revenue" fill="#16a34a" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="metaCharged" name="Meta charged" fill="#dc2626" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="expectedMetaCost" name="Expected Meta cost" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <CardHeader title="Reconciliation notes" />
              <div className="mt-3 space-y-4 text-sm">
                <div>
                  <p className="font-medium">Client revenue</p>
                  <p className="mt-1 text-muted-foreground">Comes from completed wallet message debits and campaign reservations, net of refunds.</p>
                </div>
                <div>
                  <p className="font-medium">Meta charges</p>
                  <p className="mt-1 text-muted-foreground">Comes from stored Meta expense snapshots. Rows without snapshots are marked Not synced.</p>
                </div>
                <div>
                  <p className="font-medium">Expected Meta cost</p>
                  <p className="mt-1 text-muted-foreground">Calculated per delivered/read recipient using WhatsApp's current India INR platform pricing, plus {summary.totals.expectedMetaTaxPercent}% GST.</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-2 font-medium">Current India INR rates</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p>Marketing: <span className="font-medium">{fmtRate(metaRates.marketing?.quote)}</span></p>
                    <p>Utility: <span className="font-medium">{fmtRate(metaRates.utility?.quote)}</span></p>
                    <p>Authentication: <span className="font-medium">{fmtRate(metaRates.authentication?.quote)}</span></p>
                    <p>Service: <span className="font-medium">{fmtRate(metaRates.service?.quote)}</span></p>
                  </div>
                  {summary.metaPricing?.error && <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{summary.metaPricing.error}</p>}
                </div>
                <div>
                  <p className="font-medium">Sync source</p>
                  <p className="mt-1 text-muted-foreground">Sync Meta calls each WABA's pricing_analytics edge for COST and VOLUME, then stores the result by WABA and period.</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">All clients overview</h2>
              <p className="text-xs text-muted-foreground">Compare revenue, Meta costs, and reconciliation status across every client.</p>
            </div>
            <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[1fr_170px_170px]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search client, WABA ID, phone, plan..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </Select>
              <Select value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)}>
                <option value="all">All sync states</option>
                <option value="synced">Meta cost synced</option>
                <option value="unsynced">Not synced</option>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortableTh label="Client" sortKey="client" sort={sort} onSort={setSort} />
                    <SortableTh label="WABAs" sortKey="accounts" sort={sort} onSort={setSort} />
                    <SortableTh label="Client revenue" sortKey="clientRevenue" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Expected cost" sortKey="expectedMetaCost" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Meta charged" sortKey="metaCharged" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Expected margin" sortKey="expectedMargin" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Known margin" sortKey="margin" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Margin %" sortKey="marginPercent" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Messages" sortKey="expectedBillableMessages" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Sync" sortKey="sync" sort={sort} onSort={setSort} />
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!filteredRows.length && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">No expense rows match these filters.</td></tr>
                  )}
                  {expensesPage.pageItems.map((row) => (
                    <tr key={row.tenantId} className="table-row-hover">
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.clientName}</p>
                        <p className="text-xs text-muted-foreground">{row.contactEmail || '-'}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge label={row.status || 'unknown'} color={STATUS_COLOR[row.status] || 'gray'} />
                          {row.planName && <Badge label={row.planName} color="blue" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {!row.accounts?.length ? (
                          <span className="text-muted-foreground">No WABA</span>
                        ) : (
                          <div className="max-w-xs space-y-2">
                            {row.accounts.map((account) => (
                              <div key={account.id}>
                                <p className="font-medium">{account.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">{account.wabaId}</p>
                                <p className="text-xs text-muted-foreground">{account.phone || account.phoneNumberId || '-'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtMoney(row.clientRevenue)}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold">{fmtMoney(row.expectedMetaCost)}</p>
                        <p className="text-xs text-muted-foreground">{fmtMoney(row.expectedMetaSubtotal)} + {fmtMoney(row.expectedMetaTax)} GST</p>
                        <p className="text-xs text-muted-foreground">
                          M {row.expectedCategoryCounts?.marketing || 0} / U {row.expectedCategoryCounts?.utility || 0} / A {row.expectedCategoryCounts?.authentication || 0} / S {row.expectedCategoryCounts?.service || 0}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{row.hasMetaCost ? fmtMoney(row.metaCharged) : '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtMoney(row.expectedMargin)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.hasMetaCost ? fmtMoney(row.margin) : '-'}</td>
                      <td className="px-4 py-3 text-right">{fmtPercent(row.marginPercent)}</td>
                      <td className="px-4 py-3 text-right">
                        <p>{Number(row.expectedBillableMessages || 0).toLocaleString('en-IN')}</p>
                        <p className="text-xs text-muted-foreground">{Number(row.billableEntries || 0).toLocaleString('en-IN')} wallet row(s)</p>
                      </td>
                      <td className="px-4 py-3">
                        {row.hasMetaCost ? (
                          <div>
                            <Badge label={row.accounts?.some((account) => account.metaCostSnapshot?.source === 'manual') ? 'Manual' : 'Synced'} color={row.accounts?.some((account) => account.metaCostSnapshot?.source === 'manual') ? 'blue' : 'green'} />
                            <p className="mt-1 text-xs text-muted-foreground">{fmtDate(row.latestMetaSyncAt)}</p>
                          </div>
                        ) : (
                          <Badge label="Not synced" color="yellow" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openManualCost(row)} disabled={!row.accounts?.length || period === 'all'}>
                            <Pencil size={13} />Meta cost
                          </Button>
                          <Link href={`/admin/tenants/${row.tenantId}`} className="text-primary hover:underline">Details</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...expensesPage} onPageChange={expensesPage.setPage} onPageSizeChange={expensesPage.setPageSize} />
          </Card>

          <Modal
            open={!!manualTarget}
            onClose={() => setManualTarget(null)}
            title={`Meta cost - ${manualTarget?.clientName || ''}`}
            className="max-w-2xl"
            footer={(
              <>
                <Button variant="outline" onClick={() => setManualTarget(null)} disabled={manualSaving}>Cancel</Button>
                <Button onClick={saveManualCost} disabled={manualSaving || !manualForm.accountId}>
                  {manualSaving ? 'Saving...' : 'Save Meta cost'}
                </Button>
              </>
            )}
          >
            <div className="space-y-4">
              {manualError && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{manualError}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="WhatsApp account" value={manualForm.accountId} onChange={(e) => updateManualAccount(e.target.value)}>
                  {manualTarget?.accounts?.map((account) => (
                    <option key={account.id} value={account.id}>{account.name} - {account.phone || account.wabaId}</option>
                  ))}
                </Select>
                <Input
                  label="Actual Meta cost paid"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={manualForm.metaChargedAmount}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, metaChargedAmount: e.target.value }))}
                  placeholder="0.0000"
                />
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 text-right font-semibold">Meta price</th>
                      <th className="px-3 py-2 text-right font-semibold">Our current price</th>
                      <th className="px-3 py-2 text-right font-semibold">Messages</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {PRICE_CATEGORIES.map(([key, label]) => (
                      <tr key={key}>
                        <td className="px-3 py-2 font-medium">{label}</td>
                        <td className="px-3 py-2 text-right">{fmtRate(metaRates[key]?.quote)}</td>
                        <td className="px-3 py-2 text-right">{fmtRate(manualTarget?.planMessageRates?.[key])}</td>
                        <td className="px-3 py-2 text-right">{Number(manualTarget?.expectedCategoryCounts?.[key] || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Expected Meta cost</p>
                  <p className="mt-1 font-semibold">{fmtMoney(manualTarget?.expectedMetaCost)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Saved cost for selected WABA</p>
                  <p className="mt-1 font-semibold">{selectedManualAccount?.metaCostSnapshot ? fmtMoney(selectedManualAccount.metaCostSnapshot.amount) : '-'}</p>
                </div>
              </div>

              <Input
                label="Meta invoice/reference ID"
                value={manualForm.metaInvoiceId}
                onChange={(e) => setManualForm((prev) => ({ ...prev, metaInvoiceId: e.target.value }))}
                placeholder="Optional"
              />
              <Textarea
                label="Notes"
                value={manualForm.notes}
                onChange={(e) => setManualForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </Modal>
        </>
      )}
    </AppShell>
  );
}
