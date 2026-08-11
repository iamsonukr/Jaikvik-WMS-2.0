'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import {
  PageHeader, StatCard, Card, CardHeader, Spinner, Empty, Input, Select,
  Badge, SortableTh, PaginationControls, sortItems, usePagination,
} from '@/components/ui';
import { BarChart3, IndianRupee, Landmark, ReceiptText, Search, WalletCards } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import api from '@/lib/api';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => value === null || value === undefined ? '-' : `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
const fmtPercent = (value) => value === null || value === undefined ? '-' : `${Number(value).toLocaleString('en-IN')}%`;
const fmtDate = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

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

  useEffect(() => {
    setSummary(null);
    setError('');
    api.get(`/expenses/admin/summary?period=${period}`)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Could not load expenses.'));
  }, [period]);

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
    margin: (row) => row.margin ?? -1,
    marginPercent: (row) => row.marginPercent ?? -1,
    billableEntries: (row) => row.billableEntries,
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
      }))
  ), [rows]);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Expenses"
        subtitle="Reconcile client message revenue against Meta charges per WhatsApp Business Account."
        action={(
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44">
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
          </Select>
        )}
      />

      {error && <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {!summary ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Client message revenue" value={fmtMoney(summary.totals.clientRevenue)} icon={IndianRupee} color="#16a34a" sub="Wallet debits minus refunds" />
            <StatCard label="Meta charges synced" value={fmtMoney(summary.totals.metaCharged)} icon={Landmark} color="#dc2626" sub="Actual cost snapshots" />
            <StatCard label="Known margin" value={fmtMoney(summary.totals.knownMargin)} icon={BarChart3} color="#2563eb" sub="Only synced expenses" />
            <StatCard label="Unsynced clients" value={summary.totals.unsyncedClients} icon={WalletCards} color="#f59e0b" sub={`${summary.totals.connectedWabas} connected WABA(s)`} />
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
                  <p className="font-medium">Next sync source</p>
                  <p className="mt-1 text-muted-foreground">Use each WABA's Meta billing/analytics export or API to populate snapshots by WABA and period.</p>
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
                    <SortableTh label="Meta charged" sortKey="metaCharged" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Margin" sortKey="margin" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Margin %" sortKey="marginPercent" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Entries" sortKey="billableEntries" sort={sort} onSort={setSort} align="right" />
                    <SortableTh label="Sync" sortKey="sync" sort={sort} onSort={setSort} />
                    <th className="px-4 py-3 text-right font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!filteredRows.length && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No expense rows match these filters.</td></tr>
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
                      <td className="px-4 py-3 text-right font-semibold">{row.hasMetaCost ? fmtMoney(row.metaCharged) : '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.hasMetaCost ? fmtMoney(row.margin) : '-'}</td>
                      <td className="px-4 py-3 text-right">{fmtPercent(row.marginPercent)}</td>
                      <td className="px-4 py-3 text-right">{Number(row.billableEntries || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        {row.hasMetaCost ? (
                          <div>
                            <Badge label="Synced" color="green" />
                            <p className="mt-1 text-xs text-muted-foreground">{fmtDate(row.latestMetaSyncAt)}</p>
                          </div>
                        ) : (
                          <Badge label="Not synced" color="yellow" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/tenants/${row.tenantId}`} className="text-primary hover:underline">Details</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls {...expensesPage} onPageChange={expensesPage.setPage} onPageSizeChange={expensesPage.setPageSize} />
          </Card>
        </>
      )}
    </AppShell>
  );
}
