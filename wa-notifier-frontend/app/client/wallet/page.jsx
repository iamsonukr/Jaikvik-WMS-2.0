'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, Button, Input, Modal, PageHeader, StatCard, Badge, Empty, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { Wallet as WalletIcon, TrendingUp, TrendingDown, Plus, Receipt } from 'lucide-react';
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

function WalletPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState('500');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [balRes, txnRes] = await Promise.all([
      api.get('/wallet/me'),
      api.get('/wallet/me/transactions'),
    ]);
    setBalance(balRes.data);
    setTransactions(txnRes.data.items);
  };

  useEffect(() => { load(); }, []);

  const recharge = async () => {
    setError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }

    setProcessing(true);
    try {
      const ready = await loadRazorpayScript();
      if (!ready) throw new Error('Could not load Razorpay checkout — check your connection');

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
      rzp.on('payment.failed', () => setError('Payment failed — please try again'));
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
        action={<Button onClick={() => setRechargeOpen(true)}><Plus size={16} /> Add money</Button>}
      />

      {!balance ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <StatCard label="Available balance" value={`₹${balance.balance.toLocaleString('en-IN')}`} icon={WalletIcon} color="#25D366" />
            <StatCard label="Total recharged" value={`₹${balance.totalRecharged.toLocaleString('en-IN')}`} icon={TrendingUp} color="#3b82f6" />
            <StatCard label="Total spent" value={`₹${balance.totalSpent.toLocaleString('en-IN')}`} icon={TrendingDown} color="#f59e0b" />
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold text-sm">Recent transactions</h3>
            </div>
            {!transactions?.length ? (
              <Empty icon={Receipt} title="No transactions yet" description="Recharge your wallet to get started." />
            ) : (
              <div className="divide-y divide-border">
                {transactions.map((t) => {
                  const isCredit = t.creditAmount > 0;
                  return (
                    <div key={t._id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {TYPE_LABELS[t.type] || t.type}
                          {t.messageCategory && <Badge label={t.messageCategory} className="ml-2" />}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.description || '—'} · {new Date(t.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <p className={`shrink-0 text-sm font-semibold ${isCredit ? 'text-emerald-500' : 'text-red-500'}`}>
                        {isCredit ? '+' : '-'}₹{(isCredit ? t.creditAmount : t.debitAmount).toLocaleString('en-IN')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal open={rechargeOpen} onClose={() => !processing && setRechargeOpen(false)} title="Add money to wallet"
        footer={
          <>
            <Button variant="outline" onClick={() => setRechargeOpen(false)} disabled={processing}>Cancel</Button>
            <Button onClick={recharge} disabled={processing}>{processing ? 'Processing…' : 'Proceed to pay'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-sm font-medium">Amount (INR)</label>
          <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="flex gap-2">
            {[500, 1000, 2500, 5000].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(String(v))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                ₹{v}
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
