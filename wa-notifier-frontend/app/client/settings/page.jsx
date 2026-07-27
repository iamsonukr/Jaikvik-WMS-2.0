'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Card, Input, PageHeader, Spinner, StatCard } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import {
  CalendarDays, CheckCircle2, CreditCard, ExternalLink, KeyRound, MessageCircle,
  RefreshCw, ShieldCheck, UserCircle, Wallet as WalletIcon,
} from 'lucide-react';

const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const fmtMoney = (value, currency = 'INR') => `${currency === 'INR' ? 'Rs. ' : `${currency} `}${Number(value || 0).toLocaleString('en-IN')}`;
const fmtLimit = (value) => {
  if (value === null || value === undefined || value === '') return 'Unlimited';
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN') : String(value);
};
const cycleLabel = (cycle) => String(cycle || '-').replace('_', ' ');
const priceForCycle = (plan, cycle) => {
  if (!plan?.price) return null;
  if (typeof plan.price === 'number') return plan.price;
  return plan.price?.[cycle] ?? null;
};
const planPriceValue = (plan, subscription) => {
  if (subscription?.priceSnapshot !== undefined && subscription?.priceSnapshot !== null) {
    return fmtMoney(subscription.priceSnapshot, subscription.currency || plan?.currency);
  }
  if (!plan?.price) return 'On request';
  const value = priceForCycle(plan, subscription?.billingCycleSnapshot || 'quarterly');
  return value === null || value === undefined ? '-' : fmtMoney(value, plan.currency);
};
const featureLines = (features) => {
  if (Array.isArray(features)) return features.filter(Boolean);
  return Object.entries(features || {})
    .filter(([, value]) => value === true || typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => value === true ? key.replace(/([A-Z])/g, ' $1').toLowerCase() : `${key}: ${value}`);
};
const limitValue = (plan, key) => plan?.[key] ?? plan?.limits?.[key] ?? null;
const usagePercent = (used, limit) => {
  if (limit === null || limit === undefined || limit === '') return 0;
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((Number(used || 0) / parsed) * 100));
};

function DetailItem({ label, value }) {
  const displayValue = value === null || value === undefined || value === '' ? '-' : value;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{displayValue}</p>
    </div>
  );
}

function UsageRow({ label, used, limit }) {
  const percent = usagePercent(used, limit);
  const hasLimit = !(limit === null || limit === undefined || limit === '');

  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{Number(used || 0).toLocaleString('en-IN')} / {fmtLimit(limit)}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: hasLimit ? `${percent}%` : '8%' }}
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { clients, refreshClients, loading: clientsLoading } = useClient();
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [notice, setNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [usage, setUsage] = useState({ contacts: 0, tags: 0 });
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [billingProfile, setBillingProfile] = useState(null);
  const [billingForm, setBillingForm] = useState({});
  const [savingBilling, setSavingBilling] = useState(false);

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', email: user.email || '' });
  }, [user]);

  const loadAccount = async () => {
    setLoadingAccount(true);
    try {
      const [subscriptionRes, walletRes, billingRes, accountList] = await Promise.all([
        api.get('/subscriptions/me').catch(() => ({ data: null })),
        api.get('/wallet/me').catch(() => ({ data: null })),
        api.get('/tenants/me/billing').catch(() => ({ data: null })),
        refreshClients(),
      ]);
      const usageResults = await Promise.all(
        (accountList || []).map(async (account) => {
          const [countRes, tagsRes] = await Promise.all([
            api.get(`/contacts/count?whatsappAccountId=${account._id}`).catch(() => ({ data: { count: 0 } })),
            api.get(`/contacts/tags?whatsappAccountId=${account._id}`).catch(() => ({ data: [] })),
          ]);
          return { contacts: Number(countRes.data?.count || 0), tags: tagsRes.data?.length || 0 };
        }),
      );
      setSubscription(subscriptionRes.data);
      setWallet(walletRes.data);
      setBillingProfile(billingRes.data);
      setBillingForm(billingRes.data || {});
      setUsage(usageResults.reduce((total, item) => ({
        contacts: total.contacts + item.contacts,
        tags: total.tags + item.tags,
      }), { contacts: 0, tags: 0 }));
    } finally {
      setLoadingAccount(false);
    }
  };

  useEffect(() => { loadAccount(); }, []);

  const plan = subscription?.planId;
  const isExpired = subscription?.endDate ? new Date(subscription.endDate) < new Date() : false;
  const subscriptionStatus = isExpired ? 'expired' : subscription?.status;
  const features = useMemo(() => featureLines(plan?.features).slice(0, 8), [plan]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch('/auth/me', { name: profile.name, email: profile.email });
      setNotice('Profile updated.');
    } catch (err) {
      setNotice('Error: ' + (err?.response?.data?.message || 'Could not update profile'));
    } finally {
      setSavingProfile(false);
    }
    setTimeout(() => setNotice(''), 4000);
  };

  const savePassword = async () => {
    if (!pw.current) { setNotice('Error: Enter your current password'); return; }
    if (pw.next.length < 6) { setNotice('Error: New password must be at least 6 characters'); return; }
    if (pw.next !== pw.confirm) { setNotice('Error: New passwords do not match'); return; }
    setSavingPw(true);
    try {
      await api.patch('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      setNotice('Password updated.');
    } catch (err) {
      setNotice('Error: ' + (err?.response?.data?.message || 'Could not update password'));
    } finally {
      setSavingPw(false);
    }
    setTimeout(() => setNotice(''), 4000);
  };

  const saveBilling = async () => {
    setSavingBilling(true);
    try {
      const payload = {
        billingEmail: billingForm.billingEmail || '',
        taxId: billingForm.taxId || '',
        addressLine1: billingForm.addressLine1 || '',
        addressLine2: billingForm.addressLine2 || '',
        city: billingForm.city || '',
        state: billingForm.state || '',
        country: billingForm.country || '',
        postalCode: billingForm.postalCode || '',
      };
      const { data } = await api.patch('/tenants/me/billing', payload);
      setBillingProfile(data);
      setBillingForm(data || {});
      setNotice('Billing details updated.');
    } catch (err) {
      setNotice('Error: ' + (err?.response?.data?.message || 'Could not update billing details'));
    } finally {
      setSavingBilling(false);
    }
    setTimeout(() => setNotice(''), 4000);
  };

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
  const webhookUrl = `${apiBase}/api/webhooks/meta`;

  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <PageHeader
        title="Settings"
        subtitle="Manage your plan, connected WhatsApp numbers, billing snapshot, and login security."
        action={
          <Button variant="outline" onClick={loadAccount} disabled={loadingAccount || clientsLoading}>
            <RefreshCw size={15} /> Refresh
          </Button>
        }
      />

      {loadingAccount && !subscription ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Current plan" value={plan?.name || 'No plan'} icon={CreditCard} color="#3b82f6" sub={subscriptionStatus || 'Not assigned'} />
            <StatCard label="WhatsApp numbers" value={clients.length} icon={MessageCircle} color="#25D366" sub={`Limit ${fmtLimit(limitValue(plan, 'whatsappNumbers'))}`} />
            <StatCard label="Wallet balance" value={wallet ? fmtMoney(wallet.balance) : '-'} icon={WalletIcon} color="#f59e0b" sub="Available funds" />
            <StatCard label="Renewal date" value={fmtDate(subscription?.endDate)} icon={CalendarDays} color="#6366f1" sub={cycleLabel(subscription?.billingCycleSnapshot)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{plan?.name || 'No active plan'}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{plan?.description || 'Ask your platform admin to assign a plan to this client.'}</p>
                </div>
                {subscriptionStatus && (
                  <Badge label={subscriptionStatus} color={subscriptionStatus === 'active' ? 'green' : subscriptionStatus === 'expired' ? 'red' : 'gray'} />
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Price" value={planPriceValue(plan, subscription)} />
                <DetailItem label="Billing cycle" value={cycleLabel(subscription?.billingCycleSnapshot)} />
                <DetailItem label="Trial days" value={plan?.trialDays ?? 0} />
                <DetailItem label="Started" value={fmtDate(subscription?.startDate)} />
                <DetailItem label="Renews / ends" value={fmtDate(subscription?.endDate)} />
                <DetailItem label="Subscription ID" value={subscription?._id} />
              </div>

              {features.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Included features</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold">Plan Usage</h2>
              <div className="space-y-3">
                <UsageRow label="WhatsApp numbers" used={clients.length} limit={limitValue(plan, 'whatsappNumbers')} />
                <UsageRow label="Contacts" used={usage.contacts} limit={limitValue(plan, 'contacts')} />
                <UsageRow label="Login users" used={1} limit={limitValue(plan, 'teamMembers')} />
                <UsageRow label="Tags" used={usage.tags} limit={limitValue(plan, 'tags')} />
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Connected WhatsApp Numbers</h2>
                <Link href="/client/connect-whatsapp">
                  <Button size="sm"><MessageCircle size={14} /> Add number</Button>
                </Link>
              </div>
              {!clients.length ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No WhatsApp number is connected yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {clients.map((account) => (
                    <div key={account._id} className="rounded-lg border border-border bg-muted/25 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{account.name}</p>
                          <p className="text-xs text-muted-foreground">{account.phone || 'Phone number unavailable'}</p>
                        </div>
                        <Badge label={account.isActive ? 'Active' : 'Inactive'} color={account.isActive ? 'green' : 'gray'} />
                      </div>
                      <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">Phone ID: {account.phoneNumberId}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold">Billing Snapshot</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <DetailItem label="Available balance" value={wallet ? fmtMoney(wallet.balance) : '-'} />
                <DetailItem label="Total recharged" value={wallet ? fmtMoney(wallet.totalRecharged) : '-'} />
                <DetailItem label="Total spent" value={wallet ? fmtMoney(wallet.totalSpent) : '-'} />
              </div>
              <Link href="/client/wallet" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Open wallet <ExternalLink size={13} />
              </Link>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Billing Address & GST Details</h2>
              </div>
              {user?.role !== 'client_owner' && (
                <span className="text-xs text-muted-foreground">Owner access required to edit</span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="Client" value={billingProfile?.name} />
              <DetailItem label="Contact email" value={billingProfile?.contactEmail} />
              <Input
                label="Billing email"
                type="email"
                value={billingForm.billingEmail || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, billingEmail: e.target.value }))}
              />
              <Input
                label="GSTIN / Tax ID"
                value={billingForm.taxId || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, taxId: e.target.value }))}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Address line 1"
                value={billingForm.addressLine1 || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, addressLine1: e.target.value }))}
              />
              <Input
                label="Address line 2"
                value={billingForm.addressLine2 || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, addressLine2: e.target.value }))}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                label="City"
                value={billingForm.city || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, city: e.target.value }))}
              />
              <Input
                label="State"
                value={billingForm.state || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, state: e.target.value }))}
              />
              <Input
                label="Country"
                value={billingForm.country || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, country: e.target.value }))}
              />
              <Input
                label="Postal code"
                value={billingForm.postalCode || ''}
                disabled={user?.role !== 'client_owner'}
                onChange={(e) => setBillingForm((form) => ({ ...form, postalCode: e.target.value }))}
              />
            </div>
            {user?.role === 'client_owner' && (
              <Button className="mt-4" onClick={saveBilling} disabled={savingBilling}>
                {savingBilling ? 'Saving...' : 'Save billing details'}
              </Button>
            )}
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <UserCircle size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Profile</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                <Input label="Email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
              </div>
              <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save profile'}</Button>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-primary" />
                <h2 className="text-sm font-semibold">Security</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Current password" type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
                <Input label="New password" type="password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
                <Input label="Confirm password" type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
              </div>
              <Button onClick={savePassword} disabled={savingPw}>{savingPw ? 'Updating...' : 'Update password'}</Button>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Meta Webhook Configuration</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <p className="text-xs text-muted-foreground">Webhook URL</p>
                <div className="mt-1 break-all rounded-lg border border-border bg-muted/70 px-3 py-2.5 font-mono text-xs">
                  {webhookUrl}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Verify token</p>
                <div className="mt-1 rounded-lg border border-border bg-muted/70 px-3 py-2.5 font-mono text-xs">
                  wa_notifier_verify
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['messages', 'message_deliveries', 'message_reads', 'account_alerts'].map(field => (
                <span key={field} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{field}</span>
              ))}
            </div>
          </Card>

          {notice && (
            <div className={`soft-alert ${notice.startsWith('Error:')
              ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300'}`}>
              {notice}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
