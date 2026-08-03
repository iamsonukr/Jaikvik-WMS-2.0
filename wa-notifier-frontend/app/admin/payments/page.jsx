'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Badge, Button, Empty, Spinner, Input, Select, SearchableSelect, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { CreditCard, Download } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLOR = { paid: 'green', created: 'yellow', failed: 'red' };
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';
const clientIdOf = (payment) => String(payment?.tenantId?._id || payment?.tenantId || '');

export default function PaymentsPage() {
  const [payments, setPayments] = useState(null);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => { api.get('/payments').then((r) => setPayments(r.data)); }, []);

  const purposeOptions = useMemo(() => {
    const values = (payments || []).map((p) => p.purpose).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [payments]);

  const clientOptions = useMemo(() => {
    const byId = new Map();
    (payments || []).forEach((payment) => {
      const id = clientIdOf(payment);
      if (!id || byId.has(id)) return;
      byId.set(id, {
        id,
        name: payment.tenantId?.name || 'Unknown client',
        email: payment.tenantId?.contactEmail || '',
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const query = text(search.trim());
    return (payments || []).filter((p) => {
      const matchesSearch = !query
        || text(p.tenantId?.name).includes(query)
        || text(p.tenantId?.contactEmail).includes(query)
        || text(p.razorpayOrderId).includes(query)
        || text(p.razorpayPaymentId).includes(query)
        || text(p.purpose).includes(query);
      const matchesClient = clientFilter === 'all' || clientIdOf(p) === clientFilter;
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesPurpose = purposeFilter === 'all' || p.purpose === purposeFilter;
      return matchesSearch && matchesClient && matchesStatus && matchesPurpose;
    });
  }, [payments, search, clientFilter, statusFilter, purposeFilter]);

  const sortedPayments = useMemo(() => sortItems(filteredPayments, sort, {
    client: (p) => p.tenantId?.name || p.tenantId?.contactEmail,
    orderId: (p) => p.razorpayOrderId,
    paymentId: (p) => p.razorpayPaymentId,
    purpose: (p) => p.purpose,
    amount: (p) => p.amount,
    status: (p) => p.status,
    createdAt: (p) => p.createdAt,
  }), [filteredPayments, sort]);
  const paymentsPage = usePagination(sortedPayments, {
    initialPageSize: 10,
    resetKey: `${search}|${clientFilter}|${statusFilter}|${purposeFilter}|${sort.key}|${sort.direction}`,
  });

  const downloadPdf = async (payment) => {
    setDownloadingId(payment._id);
    try {
      const { data, headers } = await api.get(`/payments/${payment._id}/invoice.pdf`, { responseType: 'blob' });
      const disposition = headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `billing-document-${payment._id}.pdf`;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Payments" subtitle="Every Razorpay payment recorded on the platform." />

      {!payments ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !payments.length ? (
        <Empty icon={CreditCard} title="No payments yet" description="Payments appear here once a client recharges their wallet." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[1fr_240px_160px_190px]">
            <Input placeholder="Search order id, payment id, purpose..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <SearchableSelect
              value={clientFilter}
              onChange={setClientFilter}
              placeholder="All clients"
              searchPlaceholder="Search clients..."
              emptyText="No matching clients"
              options={[
                { value: 'all', label: 'All clients' },
                ...clientOptions.map((client) => ({
                  value: client.id,
                  label: client.name,
                  description: client.email,
                  searchText: `${client.name} ${client.email}`,
                })),
              ]}
            />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="created">Created</option>
              <option value="failed">Failed</option>
            </Select>
            <Select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)}>
              <option value="all">All purposes</option>
              {purposeOptions.map((purpose) => (
                <option key={purpose} value={purpose}>{purpose.replace('_', ' ')}</option>
              ))}
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Client" sortKey="client" sort={sort} onSort={setSort} />
                  <SortableTh label="Order ID" sortKey="orderId" sort={sort} onSort={setSort} />
                  <SortableTh label="Payment ID" sortKey="paymentId" sort={sort} onSort={setSort} />
                  <SortableTh label="Purpose" sortKey="purpose" sort={sort} onSort={setSort} />
                  <SortableTh label="Amount" sortKey="amount" sort={sort} onSort={setSort} align="right" />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={setSort} />
                  <SortableTh label="Created" sortKey="createdAt" sort={sort} onSort={setSort} />
                  <th className="px-4 py-3 text-right font-semibold">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredPayments.length && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No payments match these filters.</td></tr>
                )}
                {paymentsPage.pageItems.map((p) => (
                  <tr key={p._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.tenantId?.name || 'Unknown client'}</p>
                      <p className="text-xs text-muted-foreground">{p.tenantId?.contactEmail || '-'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{p.razorpayOrderId || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.razorpayPaymentId || '-'}</td>
                    <td className="px-4 py-3"><Badge label={(p.purpose || '-').replace('_', ' ')} color="blue" /></td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtMoney(p.amount)}</td>
                    <td className="px-4 py-3"><Badge label={p.status || 'unknown'} color={STATUS_COLOR[p.status] || 'gray'} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={p.status !== 'paid' || downloadingId === p._id}
                        onClick={() => downloadPdf(p)}
                      >
                        <Download size={13} /> {downloadingId === p._id ? 'Downloading...' : 'PDF'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls {...paymentsPage} onPageChange={paymentsPage.setPage} onPageSizeChange={paymentsPage.setPageSize} />
        </Card>
      )}
    </AppShell>
  );
}
