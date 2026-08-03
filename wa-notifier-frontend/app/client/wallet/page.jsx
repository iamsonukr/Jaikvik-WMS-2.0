'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, StatCard, PaginationControls, usePagination } from '@/components/ui';
import { Wallet as WalletIcon, TrendingUp, TrendingDown, Plus, Receipt, CreditCard } from 'lucide-react';
import api from '@/lib/api';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const TYPE_LABELS = {
  recharge: 'Recharge',
  message_debit: 'Message sent',
  campaign_reservation: 'Campaign reserved',
  refund: 'Refund',
  manual_credit: 'Manual credit',
  manual_debit: 'Manual debit',
  reversal: 'Reversal',
};
const text = (value) => String(value || '').toLowerCase();
const fmtMoney = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

function WalletPage() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState('500');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');

  const load = async () => {
    const [balRes, txnRes] = await Promise.all([
      api.get('/wallet/me'),
      api.get('/wallet/me/transactions'),
    ]);
    setBalance(balRes.data);
    setTransactions(txnRes.data.items);
  };

  useEffect(() => { load(); }, []);

  const typeOptions = useMemo(() => {
    const values = (transactions || []).map((transaction) => transaction.type).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = text(search.trim());
    return (transactions || []).filter((transaction) => {
      const isCredit = Number(transaction.creditAmount || 0) > 0;
      const matchesSearch = !query
        || text(TYPE_LABELS[transaction.type] || transaction.type).includes(query)
        || text(transaction.description).includes(query)
        || text(transaction.messageCategory).includes(query)
        || text(transaction._id).includes(query);
      const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
      const matchesDirection = directionFilter === 'all'
        || (directionFilter === 'credit' && isCredit)
        || (directionFilter === 'debit' && !isCredit);
      return matchesSearch && matchesType && matchesDirection;
    });
  }, [transactions, search, typeFilter, directionFilter]);
  const transactionsPage = usePagination(filteredTransactions, {
    initialPageSize: 25,
    resetKey: `${search}|${typeFilter}|${directionFilter}`,
  });

  const recharge = async () => {
    setError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }

    setProcessing(true);
    try {
      const ready = await loadRazorpayScript();
      if (!ready) throw new Error('Could not load Razorpay checkout; check your connection');

      const { data: order } = await api.post('/payments/wallet-recharge/order', { amount: amt });

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Jaikvik WMS',
        description: 'Wallet recharge',
        theme: { color: '#25D366' },
        handler: async (response) => {
          try {
            await api.post('/payments/wallet-recharge/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setRechargeOpen(false);
            await load();
          } catch (err) {
            setError(err?.response?.data?.message || 'Payment verification failed');
          }
        },
        modal: { ondismiss: () => setProcessing(false) },
      });
      rzp.on('payment.failed', () => setError('Payment failed; please try again'));
      rzp.open();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not start checkout');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <PageHeader
        title="Wallet"
        subtitle="Recharge and track spend on messages and campaigns."
        action={
          <>
            <Link href="/client/plans">
              <Button variant="outline"><CreditCard size={16} /> Plans</Button>
            </Link>
            <Button onClick={() => setRechargeOpen(true)}><Plus size={16} /> Add money</Button>
          </>
        }
      />

      {!balance ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Available balance" value={fmtMoney(balance.balance)} icon={WalletIcon} color="#25D366" />
            <StatCard label="Total recharged" value={fmtMoney(balance.totalRecharged)} icon={TrendingUp} color="#3b82f6" />
            <StatCard label="Total spent" value={fmtMoney(balance.totalSpent)} icon={TrendingDown} color="#f59e0b" />
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_200px_160px]">
              <Input placeholder="Search description, type, category..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All transaction types</option>
                {typeOptions.map((type) => <option key={type} value={type}>{TYPE_LABELS[type] || type}</option>)}
              </Select>
              <Select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
                <option value="all">All directions</option>
                <option value="credit">Credits</option>
                <option value="debit">Debits</option>
              </Select>
            </div>
            {!transactions?.length ? (
              <Empty icon={Receipt} title="No transactions yet" description="Recharge your wallet to get started." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {['Transaction', 'Category', 'Credit', 'Debit', 'Balance After', 'Created'].map((header) => (
                        <th key={header} className="px-4 py-3 font-semibold">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!filteredTransactions.length && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No transactions match these filters.</td></tr>
                    )}
                    {transactionsPage.pageItems.map((transaction) => (
                      <tr key={transaction._id} className="table-row-hover">
                        <td className="px-4 py-3">
                          <p className="font-medium">{TYPE_LABELS[transaction.type] || transaction.type}</p>
                          <p className="max-w-xs truncate text-xs text-muted-foreground">{transaction.description || '-'}</p>
                        </td>
                        <td className="px-4 py-3">{transaction.messageCategory ? <Badge label={transaction.messageCategory} color="blue" /> : '-'}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-500">{transaction.creditAmount ? fmtMoney(transaction.creditAmount) : '-'}</td>
                        <td className="px-4 py-3 font-semibold text-red-500">{transaction.debitAmount ? fmtMoney(transaction.debitAmount) : '-'}</td>
                        <td className="px-4 py-3">{transaction.balanceAfter !== undefined ? fmtMoney(transaction.balanceAfter) : '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(transaction.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!!transactions?.length && (
              <PaginationControls {...transactionsPage} onPageChange={transactionsPage.setPage} onPageSizeChange={transactionsPage.setPageSize} />
            )}
          </Card>
        </>
      )}

      <Modal open={rechargeOpen} onClose={() => !processing && setRechargeOpen(false)} title="Add money to wallet"
        footer={
          <>
            <Button variant="outline" onClick={() => setRechargeOpen(false)} disabled={processing}>Cancel</Button>
            <Button onClick={recharge} disabled={processing}>{processing ? 'Processing...' : 'Proceed to pay'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-sm font-medium">Amount (INR)</label>
          <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="flex gap-2">
            {[500, 1000, 2500, 5000].map((value) => (
              <button key={value} type="button" onClick={() => setAmount(String(value))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                Rs. {value}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}

export default WalletPage;
