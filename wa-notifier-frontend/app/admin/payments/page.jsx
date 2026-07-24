'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Badge, Empty, Spinner, Input, Select } from '@/components/ui';
import { CreditCard } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLOR = { paid: 'green', created: 'yellow', failed: 'red' };
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

export default function PaymentsPage() {
  const [payments, setPayments] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [purposeFilter, setPurposeFilter] = useState('all');

  useEffect(() => { api.get('/payments').then((r) => setPayments(r.data)); }, []);

  const purposeOptions = useMemo(() => {
    const values = (payments || []).map((p) => p.purpose).filter(Boolean);
    return Array.from(new Set(values)).sort();
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
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesPurpose = purposeFilter === 'all' || p.purpose === purposeFilter;
      return matchesSearch && matchesStatus && matchesPurpose;
    });
  }, [payments, search, statusFilter, purposeFilter]);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Payments" subtitle="Every Razorpay payment recorded on the platform." />

      {!payments ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !payments.length ? (
        <Empty icon={CreditCard} title="No payments yet" description="Payments appear here once a client recharges their wallet." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_160px_190px]">
            <Input placeholder="Search client, order id, payment id..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Order ID</th>
                  <th className="px-4 py-3 font-semibold">Payment ID</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredPayments.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payments match these filters.</td></tr>
                )}
                {filteredPayments.map((p) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
