'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, StatCard, PaginationControls, usePagination } from '@/components/ui';
import { Wallet as WalletIcon, TrendingUp, TrendingDown, Plus, Receipt, CreditCard } from 'lucide-react';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

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
const idOf = (value) => typeof value === 'object' && value !== null ? value._id : value;

function WalletPage() {
  const { activeClient, loading: clientsLoading } = useClient();
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState('500');
  const [reason, setReason] = useState('Manual wallet credit by platform staff');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');

  const tenantId = idOf(activeClient?.tenantId);

  const load = useCallback(async () => {
    setError('');
    setBalance(null);
    setTransactions(null);

    if (!tenantId) return;

    setLoading(true);
    try {
      const [balRes, txnRes] = await Promise.all([
        api.get(`/wallet/${tenantId}`),
        api.get(`/wallet/${tenantId}/transactions`),
      ]);
      setBalance(balRes.data);
      setTransactions(txnRes.data.items || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load this wallet.');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

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
    resetKey: `${tenantId}|${search}|${typeFilter}|${directionFilter}`,
  });

  const recharge = async () => {
    setError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (!tenantId) { setError('Select a WhatsApp account linked to a tenant before adding money.'); return; }
    if (!reason.trim()) { setError('Enter a reason for this wallet credit.'); return; }

    setProcessing(true);
    try {
      await api.post(`/wallet/${tenantId}/adjust`, {
        direction: 'credit',
        amount: amt,
        reason: reason.trim(),
      });
      setRechargeOpen(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not credit this wallet');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Wallet"
        subtitle={activeClient ? `Balance and ledger for ${activeClient.name}` : 'Select a WhatsApp account to view its tenant wallet.'}
        action={
          <>
            <Link href="/master/plans">
              <Button variant="outline"><CreditCard size={16} /> Plans</Button>
            </Link>
            <Button onClick={() => setRechargeOpen(true)} disabled={!tenantId}><Plus size={16} /> Add money</Button>
          </>
        }
      />

      {error && (
        <div className="mb-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {clientsLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !activeClient ? (
        <Empty icon={WalletIcon} title="Select a WhatsApp account" description="Use the sidebar account switcher before opening a wallet." />
      ) : !tenantId ? (
        <Empty icon={WalletIcon} title="No tenant linked" description="This WhatsApp account is not attached to a client tenant, so it does not have a wallet yet." />
      ) : loading || !balance ? (
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
            <Button onClick={recharge} disabled={processing}>{processing ? 'Saving...' : 'Credit wallet'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-sm font-medium">Amount (INR)</label>
          <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="text-sm font-medium">Reason</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for manual credit" />
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
