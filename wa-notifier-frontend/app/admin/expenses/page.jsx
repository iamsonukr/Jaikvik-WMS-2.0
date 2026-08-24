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
const fmtMoney = (value) => value === null || value === undefined ? '-' : `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
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
            <Button onClick={syncMetaExpenses} disabled={syncing}>
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
            <StatCard label="Expected Meta cost" value={fmtMoney(summary.totals.expectedMetaCost)} icon={ReceiptText} color="#7c3aed" sub={`${Number(summary.totals.expectedBillableMessages || 0).toLocaleString('en-IN')} message(s), India INR`} />
            <StatCard label="Expected margin" value={fmtMoney(summary.totals.expectedMargin)} icon={BarChart3} color="#2563eb" sub="Client revenue minus expected Meta cost" />
          </div>

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
                  <p className="mt-1 text-muted-foreground">Calculated from sent/delivered broadcast logs and outbound inbox messages using WhatsApp's current India INR platform pricing.</p>
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
