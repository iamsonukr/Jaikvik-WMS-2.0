'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Select, Input, Modal, Badge, Spinner } from '@/components/ui';
import { ArrowLeft, Wallet as WalletIcon, ShieldOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { normalizeRole } from '@/lib/roles';
import Link from 'next/link';
import api from '@/lib/api';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };

export default function TenantDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const [tenant, setTenant] = useState(null);
  const [plans, setPlans] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ amount: '', direction: 'credit', reason: '' });
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [tenantRes, plansRes, walletRes, subsRes] = await Promise.all([
      api.get(`/tenants/${id}`),
      api.get('/plans'),
      api.get(`/wallet/${id}`),
      api.get(`/subscriptions/tenant/${id}`),
    ]);
    setTenant(tenantRes.data);
    setPlans(plansRes.data);
    setWallet(walletRes.data);
    setSubscription(subsRes.data?.[0] || null);
  };

  useEffect(() => { load(); }, [id]);

  const setStatus = async (status) => {
    await api.patch(`/tenants/${id}/status`, { status });
    await load();
  };

  const assignPlan = async () => {
    if (!selectedPlan) return;
    setAssigning(true);
    try {
      await api.post('/subscriptions/assign', { tenantId: id, planId: selectedPlan });
      await load();
    } finally {
      setAssigning(false);
    }
  };

  const submitAdjust = async () => {
    setError('');
    const amt = Number(adjust.amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (!adjust.reason.trim()) { setError('A reason is required'); return; }
    setAdjusting(true);
    try {
      await api.post(`/wallet/${id}/adjust`, adjust);
      setAdjustOpen(false);
      setAdjust({ amount: '', direction: 'credit', reason: '' });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not adjust wallet');
    } finally {
      setAdjusting(false);
    }
  };

  if (!tenant) {
    return (
      <AppShell allowedRoles={['admin', 'master']}>
        <div className="flex justify-center py-16"><Spinner /></div>
      </AppShell>
    );
  }

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <Link href="/admin/tenants" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back to clients
      </Link>

      <PageHeader
        title={tenant.name}
        subtitle={tenant.contactEmail}
        action={
          <>
            <Badge label={tenant.status} color={STATUS_COLOR[tenant.status] || 'gray'} />
            {/* Suspending/activating a client is admin-exclusive on the backend
                (@Roles(UserRole.ADMIN) only) — hidden for Master so the button
                doesn't appear to work and then 403. */}
            {role === 'admin' && (
              tenant.status === 'active' ? (
                <Button variant="outline" onClick={() => setStatus('suspended')}><ShieldOff size={15} /> Suspend</Button>
              ) : (
                <Button variant="outline" onClick={() => setStatus('active')}><ShieldCheck size={15} /> Activate</Button>
              )
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Subscription</h3>
          {subscription ? (
            <div className="space-y-1.5 text-sm">
              <p><span className="text-muted-foreground">Plan:</span> {subscription.planId?.name}</p>
              <p><span className="text-muted-foreground">Status:</span> {subscription.status}</p>
              <p><span className="text-muted-foreground">Renews:</span> {new Date(subscription.endDate).toLocaleDateString('en-IN')}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">No plan assigned yet.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} className="flex-1">
              <option value="">Select a plan…</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </Select>
            <Button onClick={assignPlan} disabled={!selectedPlan || assigning}>
              {assigning ? 'Assigning…' : subscription ? 'Change plan' : 'Assign plan'}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Wallet</h3>
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
              <WalletIcon size={14} /> Adjust
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Balance</p><p className="font-semibold">₹{wallet?.balance?.toLocaleString('en-IN') ?? 0}</p></div>
            <div><p className="text-muted-foreground text-xs">Recharged</p><p className="font-semibold">₹{wallet?.totalRecharged?.toLocaleString('en-IN') ?? 0}</p></div>
            <div><p className="text-muted-foreground text-xs">Spent</p><p className="font-semibold">₹{wallet?.totalSpent?.toLocaleString('en-IN') ?? 0}</p></div>
          </div>
        </Card>
      </div>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust wallet balance"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={adjusting}>{adjusting ? 'Saving…' : 'Confirm adjustment'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select value={adjust.direction} onChange={(e) => setAdjust({ ...adjust, direction: e.target.value })}>
            <option value="credit">Credit (add funds)</option>
            <option value="debit">Debit (remove funds)</option>
          </Select>
          <Input label="Amount (INR)" type="number" min="0.01" value={adjust.amount}
            onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
          <Input label="Reason (required — logged to audit trail)" value={adjust.reason}
            onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
