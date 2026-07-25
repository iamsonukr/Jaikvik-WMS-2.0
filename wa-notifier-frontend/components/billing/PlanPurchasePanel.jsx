'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { normalizeRole } from '@/lib/roles';
import api from '@/lib/api';
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw } from 'lucide-react';

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

const fmtMoney = (value, currency = 'INR') => `${currency === 'INR' ? 'Rs. ' : `${currency} `}${Number(value || 0).toLocaleString('en-IN')}`;
const cycleLabel = (cycle) => String(cycle || '').replace('_', ' ');
const featureLines = (features) => {
  if (Array.isArray(features)) return features.filter(Boolean);
  return Object.entries(features || {})
    .filter(([, value]) => value === true || typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => value === true ? key.replace(/([A-Z])/g, ' $1').toLowerCase() : `${key}: ${value}`);
};
const planTotal = (plan, cycle) => {
  const price = Number(priceForCycle(plan, cycle) || 0);
  const tax = Number(((price * Number(plan?.taxPercent || 0)) / 100).toFixed(2));
  return Number((price + tax).toFixed(2));
};
const CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly'];
const priceForCycle = (plan, cycle) => {
  if (!plan?.price) return null;
  if (typeof plan.price === 'number') return cycle === 'quarterly' ? plan.price : null;
  return plan.price?.[cycle] ?? null;
};
const availableCycles = (plan) => (
  BILLING_CYCLES.filter((cycle) => {
    const value = priceForCycle(plan, cycle);
    return value !== undefined && value !== null && value !== '';
  })
);
const messageRateRows = (plan) => {
  const rates = plan?.messageRates || {};
  return [
    ['Marketing', rates.marketing],
    ['Authentication', rates.authentication],
    ['Utility', rates.utility],
    ['Service', rates.service],
  ];
};

export default function PlanPurchasePanel({ compact = false, onPurchased }) {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const canPurchase = role === 'client_owner';
  const [plans, setPlans] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState('');
  const [message, setMessage] = useState('');
  const [billingCycle, setBillingCycle] = useState('quarterly');

  const currentPlanId = String(subscription?.planId?._id || subscription?.planId || '');

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, subscriptionRes] = await Promise.all([
        api.get('/plans/public'),
        api.get('/subscriptions/me').catch(() => ({ data: null })),
      ]);
      setPlans(plansRes.data || []);
      setSubscription(subscriptionRes.data);
      if (subscriptionRes.data?.billingCycleSnapshot && BILLING_CYCLES.includes(subscriptionRes.data.billingCycleSnapshot)) {
        setBillingCycle(subscriptionRes.data.billingCycleSnapshot);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const purchasablePlans = useMemo(() => (
    (plans || []).filter((plan) => availableCycles(plan).length > 0)
  ), [plans]);
  const visiblePlans = useMemo(() => (
    purchasablePlans.filter((plan) => priceForCycle(plan, billingCycle) !== null && priceForCycle(plan, billingCycle) !== undefined)
  ), [purchasablePlans, billingCycle]);

  const purchasePlan = async (plan) => {
    setMessage('');
    setProcessingPlanId(plan._id);
    try {
      const ready = await loadRazorpayScript();
      if (!ready) throw new Error('Could not load Razorpay checkout; check your connection');

      const { data: order } = await api.post('/payments/subscription/order', { planId: plan._id, billingCycle });

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Jaikvik WMS',
        description: `${plan.name} plan (${CYCLE_LABELS[billingCycle] || billingCycle})`,
        theme: { color: '#25D366' },
        handler: async (response) => {
          try {
            await api.post('/payments/subscription/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setMessage(`${plan.name} plan activated.`);
            await load();
            await onPurchased?.();
          } catch (err) {
            setMessage(err?.response?.data?.message || 'Payment verification failed');
          } finally {
            setProcessingPlanId('');
          }
        },
        modal: { ondismiss: () => setProcessingPlanId('') },
      });
      rzp.on('payment.failed', () => {
        setMessage('Payment failed; please try again.');
        setProcessingPlanId('');
      });
      rzp.open();
    } catch (err) {
      setMessage(err?.response?.data?.message || err.message || 'Could not start checkout');
      setProcessingPlanId('');
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Purchase Plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canPurchase ? 'Choose a plan and pay securely with Razorpay.' : 'Only the client owner can purchase or change plans.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !purchasablePlans.length ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No online purchase plans are available right now.
        </p>
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {BILLING_CYCLES.map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${billingCycle === cycle ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {CYCLE_LABELS[cycle]}
              </button>
            ))}
          </div>

          {!visiblePlans.length ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No plans have {CYCLE_LABELS[billingCycle].toLowerCase()} pricing configured.
            </p>
          ) : (
            <div className={`grid gap-3 ${compact ? 'lg:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
              {visiblePlans.map((plan) => {
            const isCurrent = currentPlanId === String(plan._id) && subscription?.billingCycleSnapshot === billingCycle;
            const total = planTotal(plan, billingCycle);
            const basePrice = priceForCycle(plan, billingCycle);
            return (
              <div key={plan._id} className={`rounded-lg border border-border p-4 ${isCurrent ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-muted/20'}`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{plan.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plan.description || '-'}</p>
                  </div>
                  {isCurrent && <Badge label="Current" color="green" />}
                </div>
                <p className="text-2xl font-bold">{fmtMoney(total, plan.currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtMoney(basePrice, plan.currency)} + {plan.taxPercent || 0}% tax, {cycleLabel(billingCycle)} billing
                </p>
                <div className="mt-4 space-y-2">
                  {featureLines(plan.features).slice(0, 4).map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-border bg-background/70 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Message cost by template type</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {messageRateRows(plan).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-semibold">{Number(value || 0) === 0 ? 'Free' : fmtMoney(value, plan.currency)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  variant={isCurrent ? 'outline' : 'primary'}
                  disabled={!canPurchase || isCurrent || processingPlanId === plan._id}
                  onClick={() => purchasePlan(plan)}
                >
                  <CreditCard size={15} />
                  {isCurrent ? 'Active plan' : processingPlanId === plan._id ? 'Opening checkout...' : 'Purchase plan'}
                </Button>
              </div>
            );
              })}
            </div>
          )}
        </>
      )}

      {plans?.some((plan) => availableCycles(plan).length === 0) && (
        <Link href="mailto:sales@jaikvikwms.com" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          Contact sales for enterprise plans <ExternalLink size={13} />
        </Link>
      )}

      {message && (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${message.includes('activated')
          ? 'border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300'
          : 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
          {message}
        </div>
      )}
    </Card>
  );
}
