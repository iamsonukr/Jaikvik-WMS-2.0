'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Spinner, Empty, Input, Select, Badge, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { ArrowRight, Wallet as WalletIcon } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => value === null || value === undefined ? '-' : `Rs. ${Number(value).toLocaleString('en-IN')}`;

export default function WalletsOverviewPage() {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'balance', direction: 'desc' });

  useEffect(() => {
    // No single "list all wallets" endpoint exists yet; this fetches each
    // tenant's balance individually.
    api.get('/tenants').then(async ({ data: tenants }) => {
      const withBalances = await Promise.all(
        tenants.map(async (t) => {
          try {
            const { data: balance } = await api.get(`/wallet/${t._id}`);
            return { tenant: t, balance };
          } catch {
            return { tenant: t, balance: null };
          }
        }),
      );
      setRows(withBalances);
    });
  }, []);

  const filteredRows = useMemo(() => {
    const query = text(search.trim());
    return (rows || []).filter(({ tenant, balance }) => {
      const walletBalance = Number(balance?.balance || 0);
      const matchesSearch = !query
        || text(tenant.name).includes(query)
        || text(tenant.contactEmail).includes(query)
        || text(tenant.contactPhone).includes(query)
        || text(tenant.planId?.name).includes(query);
      const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
      const matchesBalance = balanceFilter === 'all'
        || (balanceFilter === 'positive' && walletBalance > 0)
        || (balanceFilter === 'zero' && walletBalance === 0)
        || (balanceFilter === 'negative' && walletBalance < 0)
        || (balanceFilter === 'missing' && !balance);
      return matchesSearch && matchesStatus && matchesBalance;
    });
  }, [rows, search, statusFilter, balanceFilter]);

  const sortedRows = useMemo(() => sortItems(filteredRows, sort, {
    client: ({ tenant }) => tenant.name,
    contact: ({ tenant }) => tenant.contactEmail || tenant.contactPhone,
    plan: ({ tenant }) => tenant.planId?.name,
    balance: ({ balance }) => balance?.balance ?? 0,
    recharged: ({ balance }) => balance?.totalRecharged ?? 0,
    spent: ({ balance }) => balance?.totalSpent ?? 0,
    status: ({ tenant }) => tenant.status,
  }), [filteredRows, sort]);
  const walletsPage = usePagination(sortedRows, {
    initialPageSize: 10,
    resetKey: `${search}|${statusFilter}|${balanceFilter}|${sort.key}|${sort.direction}`,
  });

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Wallets" subtitle="Balance across every client." />

      {!rows ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !rows.length ? (
        <Empty icon={WalletIcon} title="No clients yet" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_170px_170px]">
            <Input placeholder="Search client, email, phone, plan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All client statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </Select>
            <Select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}>
              <option value="all">All balances</option>
              <option value="positive">Positive</option>
              <option value="zero">Zero</option>
              <option value="negative">Negative</option>
              <option value="missing">Unavailable</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Client" sortKey="client" sort={sort} onSort={setSort} />
                  <SortableTh label="Contact" sortKey="contact" sort={sort} onSort={setSort} />
                  <SortableTh label="Plan" sortKey="plan" sort={sort} onSort={setSort} />
                  <SortableTh label="Balance" sortKey="balance" sort={sort} onSort={setSort} align="right" />
                  <SortableTh label="Recharged" sortKey="recharged" sort={sort} onSort={setSort} align="right" />
                  <SortableTh label="Spent" sortKey="spent" sort={sort} onSort={setSort} align="right" />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                  <th className="px-4 py-3 text-right font-semibold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredRows.length && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No wallets match these filters.</td></tr>
                )}
                {walletsPage.pageItems.map(({ tenant, balance }) => (
                  <tr key={tenant._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">{tenant._id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{tenant.contactEmail || '-'}</p>
                      <p className="text-xs text-muted-foreground">{tenant.contactPhone || '-'}</p>
                    </td>
                    <td className="px-4 py-3">{tenant.planId?.name ? <Badge label={tenant.planId.name} color="blue" /> : '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtMoney(balance?.balance)}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(balance?.totalRecharged)}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(balance?.totalSpent)}</td>
                    <td className="px-4 py-3"><Badge label={tenant.status || 'unknown'} color={STATUS_COLOR[tenant.status] || 'gray'} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/tenants/${tenant._id}`} className="inline-flex items-center justify-end text-primary hover:underline">
                        Details <ArrowRight size={14} className="ml-1" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls {...walletsPage} onPageChange={walletsPage.setPage} onPageSizeChange={walletsPage.setPageSize} />
        </Card>
      )}
    </AppShell>
  );
}
