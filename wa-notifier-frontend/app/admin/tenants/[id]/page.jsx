'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Select, Input, Modal, Badge, Spinner, Textarea } from '@/components/ui';
import { ArrowLeft, Wallet as WalletIcon, ShieldOff, ShieldCheck, KeyRound, Users, UserPlus, PhoneCall, Building2, MessageCircle, Plus, Pencil, Receipt, CreditCard, CalendarDays, Download } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { normalizeRole } from '@/lib/roles';
import Link from 'next/link';
import api from '@/lib/api';
import {
  isFacebookOrigin,
  isSuccessfulEmbeddedSignupEvent,
  normalizeEmbeddedSignupData,
  parseEmbeddedSignupMessage,
} from '@/lib/meta-embedded-signup';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };
const ROLE_LABEL = { client_owner: 'Owner', client_user: 'User' };
const PAYMENT_STATUS_COLOR = { paid: 'green', created: 'yellow', failed: 'red' };
const SUBSCRIPTION_STATUS_COLOR = { active: 'green', pending: 'yellow', expired: 'red', cancelled: 'gray' };
const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'on_request', label: 'On request' },
];
const WALLET_TYPE_LABEL = {
  recharge: 'Recharge',
  message_debit: 'Message debit',
  campaign_reservation: 'Campaign reservation',
  refund: 'Refund',
  manual_credit: 'Manual credit',
  manual_debit: 'Manual debit',
  reversal: 'Reversal',
};
const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const metaApiVersion = process.env.NEXT_PUBLIC_META_API_VERSION || 'v25.0';
const blankAccountForm = {
  name: '',
  wabaId: '',
  phoneNumberId: '',
  accessToken: '',
  phone: '',
  timezone: 'Asia/Kolkata',
  industry: '',
  isActive: true,
};
const clientDetailFields = [
  'name',
  'contactPerson',
  'contactEmail',
  'billingEmail',
  'contactPhone',
  'website',
  'taxId',
  'industry',
  'timezone',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'country',
  'postalCode',
  'notes',
];
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';
const fmtMoney = (value) => `INR ${Number(value || 0).toLocaleString('en-IN')}`;
const dateForInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

function displaySubscriptionStatus(item) {
  if (!item) return '-';
  if (item.status === 'active' && item.endDate && new Date(item.endDate) < new Date()) return 'expired';
  return item.status || 'unknown';
}

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value || '-'}</p>
    </div>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const [tenant, setTenant] = useState(null);
  const [plans, setPlans] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionHistory, setSubscriptionHistory] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [downloadingPaymentId, setDownloadingPaymentId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState({ planId: '', billingCycle: 'quarterly', startDate: '', endDate: '' });
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendForm, setExtendForm] = useState({ subscriptionId: '', newEndDate: '' });
  const [extendingSubscription, setExtendingSubscription] = useState(false);
  const [extendError, setExtendError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelAction, setCancelAction] = useState('cancel');
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ amount: '', direction: 'credit', reason: '' });
  const [adjusting, setAdjusting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', password: '', role: 'client_owner' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [manualAccountOpen, setManualAccountOpen] = useState(false);
  const [manualAccountForm, setManualAccountForm] = useState(blankAccountForm);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountStatus, setAccountStatus] = useState('');
  const [accountError, setAccountError] = useState('');
  const [connectingAccount, setConnectingAccount] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsForm, setDetailsForm] = useState({});
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [error, setError] = useState('');
  const signupRef = useRef({ code: '', setup: null, submitting: false, redirectUri: '' });
  const waitTimerRef = useRef(null);

  const load = async () => {
    const [tenantRes, plansRes, walletRes, walletTxRes, subsRes, paymentsRes, accountsRes, usersRes] = await Promise.all([
      api.get(`/tenants/${id}`),
      api.get('/plans'),
      api.get(`/wallet/${id}`),
      api.get(`/wallet/${id}/transactions?limit=100`),
      api.get(`/subscriptions/tenant/${id}`),
      api.get(`/payments?tenantId=${id}`),
      api.get(`/whatsapp-accounts/tenant/${id}`),
      api.get(`/auth/tenant-users/${id}`),
    ]);
    const subscriptions = subsRes.data || [];
    setTenant(tenantRes.data);
    setPlans(plansRes.data);
    setWallet(walletRes.data);
    setWalletTransactions(walletTxRes.data?.items || []);
    setSubscription(subscriptions.find((item) => item.status === 'active') || subscriptions[0] || null);
    setSubscriptionHistory(subscriptions);
    setPayments(paymentsRes.data || []);
    setAccounts(accountsRes.data || []);
    setTenantUsers(usersRes.data || []);
  };

  useEffect(() => { load(); }, [id]);

  const clearWaitTimer = () => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  };

  const resetSignupState = () => {
    clearWaitTimer();
    signupRef.current = { code: '', setup: null, submitting: false, redirectUri: '' };
  };

  useEffect(() => {
    if (!metaAppId) return;

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: false,
        version: metaApiVersion,
      });
    };

    if (!document.getElementById('facebook-jssdk')) {
      const js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true;
      js.defer = true;
      document.body.appendChild(js);
    } else if (window.FB) {
      window.fbAsyncInit();
    }
  }, []);

  const setStatus = async (status) => {
    await api.patch(`/tenants/${id}/status`, { status });
    await load();
  };

  const openSubscriptionManager = () => {
    const active = subscription;
    setSubscriptionForm({
      planId: active?.planId?._id || active?.planId || '',
      billingCycle: active?.billingCycleSnapshot || 'quarterly',
      startDate: '',
      endDate: '',
    });
    setSubscriptionError('');
    setSubscriptionOpen(true);
  };

  const submitSubscription = async () => {
    setSubscriptionError('');
    if (!subscriptionForm.planId) { setSubscriptionError('Select a plan'); return; }
    if (subscriptionForm.startDate && subscriptionForm.endDate && new Date(subscriptionForm.endDate) <= new Date(subscriptionForm.startDate)) {
      setSubscriptionError('End date must be after start date');
      return;
    }

    setSavingSubscription(true);
    try {
      const payload = {
        tenantId: id,
        planId: subscriptionForm.planId,
        billingCycle: subscriptionForm.billingCycle,
      };
      if (subscriptionForm.startDate) payload.startDate = subscriptionForm.startDate;
      if (subscriptionForm.endDate) payload.endDate = subscriptionForm.endDate;
      await api.post('/subscriptions/assign', payload);
      setSubscriptionOpen(false);
      await load();
    } catch (err) {
      setSubscriptionError(err?.response?.data?.message || 'Could not save subscription');
    } finally {
      setSavingSubscription(false);
    }
  };

  const openExtendSubscription = (item = subscription) => {
    if (!item?._id) return;
    setExtendForm({ subscriptionId: item._id, newEndDate: dateForInput(item.endDate) });
    setExtendError('');
    setExtendOpen(true);
  };

  const submitExtendSubscription = async () => {
    setExtendError('');
    if (!extendForm.newEndDate) { setExtendError('New end date is required'); return; }
    setExtendingSubscription(true);
    try {
      await api.patch(`/subscriptions/${extendForm.subscriptionId}/extend`, { newEndDate: extendForm.newEndDate });
      setExtendOpen(false);
      await load();
    } catch (err) {
      setExtendError(err?.response?.data?.message || 'Could not extend subscription');
    } finally {
      setExtendingSubscription(false);
    }
  };

  const openCancelSubscription = (action, item = subscription) => {
    if (!item?._id) return;
    setCancelAction(action);
    setCancelTarget(item);
    setCancelReason('');
    setCancelError('');
    setCancelOpen(true);
  };

  const submitCancelSubscription = async () => {
    if (!cancelTarget?._id) return;
    setCancelError('');
    setCancellingSubscription(true);
    try {
      await api.patch(`/subscriptions/${cancelTarget._id}/${cancelAction}`, { reason: cancelReason.trim() });
      setCancelOpen(false);
      await load();
    } catch (err) {
      setCancelError(err?.response?.data?.message || `Could not ${cancelAction} subscription`);
    } finally {
      setCancellingSubscription(false);
    }
  };

  const downloadPaymentPdf = async (payment) => {
    setDownloadingPaymentId(payment._id);
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
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not download billing document');
    } finally {
      setDownloadingPaymentId(null);
    }
  };

  const submitAdjust = async () => {
    setError('');
    const amt = Number(adjust.amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (!adjust.reason.trim()) { setError('A reason is required'); return; }
    setAdjusting(true);
    try {
      await api.post(`/wallet/${id}/adjust`, {
        ...adjust,
        amount: amt,
        reason: adjust.reason.trim(),
      });
      setAdjustOpen(false);
      setAdjust({ amount: '', direction: 'credit', reason: '' });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not adjust wallet');
    } finally {
      setAdjusting(false);
    }
  };

  const openReset = (userToReset) => {
    setResetUser(userToReset);
    setResetPassword('');
    setResetMessage('');
    setError('');
    setResetOpen(true);
  };

  const openCreateUser = () => {
    setCreateUserForm({ name: '', email: tenant.contactEmail || '', password: '', role: 'client_owner' });
    setCreateUserError('');
    setCreateUserOpen(true);
  };

  const openDetails = () => {
    const next = {};
    clientDetailFields.forEach((field) => { next[field] = tenant?.[field] || ''; });
    setDetailsForm(next);
    setDetailsError('');
    setDetailsOpen(true);
  };

  const submitDetails = async () => {
    setDetailsError('');
    if (!detailsForm.name?.trim()) { setDetailsError('Company name is required'); return; }
    if (!detailsForm.contactEmail?.trim()) { setDetailsError('Contact email is required'); return; }
    setSavingDetails(true);
    try {
      await api.patch(`/tenants/${id}`, detailsForm);
      setDetailsOpen(false);
      await load();
    } catch (err) {
      setDetailsError(err?.response?.data?.message || 'Could not save client details');
    } finally {
      setSavingDetails(false);
    }
  };

  const submitCreateUser = async () => {
    setCreateUserError('');
    if (!createUserForm.name.trim()) { setCreateUserError('Name is required'); return; }
    if (!createUserForm.email.trim()) { setCreateUserError('Email is required'); return; }
    if (createUserForm.password.length < 6) { setCreateUserError('Password must be at least 6 characters'); return; }
    setCreatingUser(true);
    try {
      await api.post(`/auth/tenant-users/${id}`, createUserForm);
      setCreateUserOpen(false);
      setCreateUserForm({ name: '', email: '', password: '', role: 'client_owner' });
      await load();
    } catch (err) {
      setCreateUserError(err?.response?.data?.message || 'Could not create login user');
    } finally {
      setCreatingUser(false);
    }
  };

  const openManualAccount = () => {
    setManualAccountForm({
      ...blankAccountForm,
      name: tenant?.name ? `${tenant.name} WhatsApp` : '',
      industry: tenant?.industry || '',
      timezone: tenant?.timezone || 'Asia/Kolkata',
    });
    setAccountError('');
    setAccountStatus('');
    setManualAccountOpen(true);
  };

  const submitManualAccount = async () => {
    setAccountError('');
    setAccountStatus('');
    if (!manualAccountForm.name.trim()) { setAccountError('Account name is required'); return; }
    if (!manualAccountForm.wabaId.trim()) { setAccountError('WABA ID is required'); return; }
    if (!manualAccountForm.phoneNumberId.trim()) { setAccountError('Phone number ID is required'); return; }
    if (!manualAccountForm.accessToken.trim()) { setAccountError('Access token is required'); return; }

    setSavingAccount(true);
    try {
      await api.post('/whatsapp-accounts', {
        ...manualAccountForm,
        tenantId: id,
      });
      setManualAccountOpen(false);
      setManualAccountForm(blankAccountForm);
      setAccountStatus('WhatsApp account connected manually.');
      await load();
    } catch (err) {
      setAccountError(err?.response?.data?.message || 'Could not connect WhatsApp account');
    } finally {
      setSavingAccount(false);
    }
  };

  const finishEmbeddedSignup = useCallback(async () => {
    const current = signupRef.current;
    const phoneNumberId = current.setup?.phone_number_id || current.setup?.phoneNumberId;
    const wabaId = current.setup?.waba_id || current.setup?.wabaId;

    if (!current.code || !current.setup || current.submitting) return;
    if (!wabaId) {
      clearWaitTimer();
      setConnectingAccount(false);
      setAccountStatus('');
      setAccountError('Meta granted access, but did not return a WhatsApp Business Account ID.');
      return;
    }

    clearWaitTimer();
    current.submitting = true;
    setConnectingAccount(true);
    setAccountError('');
    setAccountStatus('Finalizing WhatsApp connection...');

    try {
      await api.post('/whatsapp-accounts/embedded-signup', {
        tenantId: id,
        code: current.code,
        wabaId,
        phoneNumberId,
        redirectUri: current.redirectUri,
        name: current.setup?.business_name || current.setup?.businessName || `${tenant?.name || 'Client'} WhatsApp`,
      });
      resetSignupState();
      setAccountStatus('WhatsApp account connected successfully.');
      await load();
    } catch (err) {
      signupRef.current.submitting = false;
      setAccountError(err?.response?.data?.message || 'Could not complete the WhatsApp connection.');
      setAccountStatus('');
    } finally {
      setConnectingAccount(false);
    }
  }, [id, tenant?.name]);

  useEffect(() => {
    const onMessage = (event) => {
      if (!isFacebookOrigin(event.origin)) return;

      const payload = parseEmbeddedSignupMessage(event.data);
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;
      const setupData = normalizeEmbeddedSignupData(payload.data);

      if (isSuccessfulEmbeddedSignupEvent(payload.event)) {
        signupRef.current.setup = setupData;
        setAccountStatus('WhatsApp details received. Waiting for authorization...');
        finishEmbeddedSignup();
        return;
      }

      if (payload.event === 'CANCEL') {
        resetSignupState();
        setConnectingAccount(false);
        setAccountStatus('');
        setAccountError('WhatsApp connection was cancelled before completion.');
      }

      if (payload.event === 'ERROR') {
        resetSignupState();
        setConnectingAccount(false);
        setAccountStatus('');
        setAccountError(payload.data?.error_message || 'Meta returned an error during WhatsApp connection.');
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishEmbeddedSignup]);

  const startEmbeddedSignup = () => {
    setAccountError('');
    setAccountStatus('');

    if (!metaAppId || !metaConfigId) {
      setAccountError('Meta Embedded Signup is not configured yet.');
      return;
    }
    if (!window.FB) {
      setAccountError('Facebook SDK is still loading. Try again in a moment.');
      return;
    }

    resetSignupState();
    setConnectingAccount(true);
    setAccountStatus('Opening Facebook Embedded Signup...');

    const redirectUri = `${window.location.origin}/master/meta-embedded-signup`;
    signupRef.current.redirectUri = redirectUri;

    window.FB.login((response) => {
      if (response?.authResponse?.code) {
        signupRef.current.code = response.authResponse.code;
        setAccountStatus('Authorization received. Waiting for WhatsApp details...');
        waitTimerRef.current = setTimeout(() => {
          if (!signupRef.current.setup) {
            setConnectingAccount(false);
            setAccountStatus('');
            setAccountError('Meta returned authorization, but did not send WhatsApp account details.');
          }
        }, 20000);
        finishEmbeddedSignup();
        return;
      }

      resetSignupState();
      setConnectingAccount(false);
      setAccountStatus('');
      setAccountError('Facebook authorization was cancelled or did not complete.');
    }, {
      config_id: metaConfigId,
      response_type: 'code',
      override_default_response_type: true,
      redirect_uri: redirectUri,
      fallback_redirect_uri: redirectUri,
      extras: {
        setup: {},
        featureType: 'whatsapp_embedded_signup',
        sessionInfoVersion: '3',
      },
    });
  };

  const submitReset = async () => {
    setError('');
    setResetMessage('');
    if (resetPassword.length < 6) { setError('New password must be at least 6 characters'); return; }
    setResetting(true);
    try {
      await api.patch(`/auth/tenant-users/${resetUser._id}/password`, { newPassword: resetPassword });
      setResetMessage(`Password reset for ${resetUser.email}`);
      setResetPassword('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not reset password');
    } finally {
      setResetting(false);
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

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              <h3 className="text-sm font-semibold">Client Details</h3>
            </div>
            <Button variant="outline" size="sm" onClick={openDetails}>
              <Pencil size={14} /> Edit
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Company name" value={tenant.name} />
            <DetailItem label="Slug" value={tenant.slug} />
            <DetailItem label="Contact person" value={tenant.contactPerson} />
            <DetailItem label="Contact email" value={tenant.contactEmail} />
            <DetailItem label="Billing email" value={tenant.billingEmail} />
            <DetailItem label="Contact phone" value={tenant.contactPhone} />
            <DetailItem label="Website" value={tenant.website} />
            <DetailItem label="GST / Tax ID" value={tenant.taxId} />
            <DetailItem label="Industry" value={tenant.industry} />
            <DetailItem label="Timezone" value={tenant.timezone} />
            <DetailItem label="Address" value={[tenant.addressLine1, tenant.addressLine2].filter(Boolean).join(', ')} wide />
            <DetailItem label="City / State" value={[tenant.city, tenant.state].filter(Boolean).join(', ')} />
            <DetailItem label="Country / Postal" value={[tenant.country, tenant.postalCode].filter(Boolean).join(' - ')} />
            <DetailItem label="Created" value={fmtDateTime(tenant.createdAt)} />
            <DetailItem label="Last updated" value={fmtDateTime(tenant.updatedAt)} />
            <DetailItem label="Client ID" value={tenant._id} wide />
            <DetailItem label="Notes" value={tenant.notes} wide />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Subscription</h3>
            <Button variant="outline" size="sm" onClick={openSubscriptionManager}>
              <CreditCard size={14} /> {subscription ? 'Change' : 'Assign'}
            </Button>
          </div>
          {subscription ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Plan" value={subscription.planId?.name} />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1">
                  <Badge
                    label={displaySubscriptionStatus(subscription)}
                    color={SUBSCRIPTION_STATUS_COLOR[displaySubscriptionStatus(subscription)] || 'gray'}
                  />
                </div>
              </div>
              <DetailItem label="Start date" value={fmtDate(subscription.startDate)} />
              <DetailItem label="End date" value={fmtDate(subscription.endDate)} />
              <DetailItem label="Price snapshot" value={fmtMoney(subscription.priceSnapshot)} />
              <DetailItem label="Billing cycle" value={subscription.billingCycleSnapshot} />
              <DetailItem label="Subscription ID" value={subscription._id} wide />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">No plan assigned yet.</p>
          )}
          {subscription && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openExtendSubscription(subscription)}>
                <CalendarDays size={14} /> Extend
              </Button>
              <Button variant="outline" size="sm" onClick={() => openCancelSubscription('cancel', subscription)}>
                Cancel
              </Button>
              {role === 'admin' && (
                <Button variant="outline" size="sm" onClick={() => openCancelSubscription('revoke', subscription)}>
                  Revoke
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Wallet</h3>
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
              <WalletIcon size={14} /> Adjust
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Balance</p><p className="font-semibold">{fmtMoney(wallet?.balance)}</p></div>
            <div><p className="text-muted-foreground text-xs">Recharged</p><p className="font-semibold">{fmtMoney(wallet?.totalRecharged)}</p></div>
            <div><p className="text-muted-foreground text-xs">Spent</p><p className="font-semibold">{fmtMoney(wallet?.totalSpent)}</p></div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-primary" />
              <h3 className="text-sm font-semibold">Login Users</h3>
            </div>
            {role === 'admin' && (
              <Button variant="outline" size="sm" onClick={openCreateUser}>
                <UserPlus size={14} /> Add login
              </Button>
            )}
          </div>
          {!tenantUsers.length ? (
            <p className="text-sm text-muted-foreground">No login users are linked to this client.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">User</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tenantUsers.map((u) => (
                    <tr key={u._id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium">{u.name || '-'}</p>
                        <p className="break-all text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="py-3 pr-3">{ROLE_LABEL[u.role] || u.role}</td>
                      <td className="py-3 pr-3">
                        <Badge label={u.isActive ? 'Active' : 'Inactive'} color={u.isActive ? 'green' : 'gray'} />
                      </td>
                      <td className="py-3 text-right">
                        {role === 'admin' ? (
                          <Button variant="outline" size="sm" onClick={() => openReset(u)}>
                            <KeyRound size={14} /> Reset
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Admin only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Connected WhatsApp Accounts</h3>
          </div>
          {role === 'admin' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={openManualAccount}>
                <Plus size={14} /> Add manually
              </Button>
              <Button size="sm" onClick={startEmbeddedSignup} disabled={connectingAccount}>
                <MessageCircle size={14} /> {connectingAccount ? 'Connecting...' : 'Embedded signup'}
              </Button>
            </div>
          )}
        </div>
        {accountStatus && (
          <div className="mb-4 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            {accountStatus}
          </div>
        )}
        {accountError && (
          <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {accountError}
          </div>
        )}
        {!accounts.length ? (
          <p className="text-sm text-muted-foreground">No WhatsApp accounts are connected to this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Meta IDs</th>
                  <th className="px-4 py-3 font-semibold">Timezone</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((account) => (
                  <tr key={account._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{account.name}</p>
                      <p className="break-all text-xs text-muted-foreground">{account._id}</p>
                    </td>
                    <td className="px-4 py-3">{account.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <p><span className="text-muted-foreground">WABA:</span> {account.wabaId}</p>
                      <p><span className="text-muted-foreground">Phone ID:</span> {account.phoneNumberId}</p>
                    </td>
                    <td className="px-4 py-3">{account.timezone || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge label={account.isActive ? 'Active' : 'Inactive'} color={account.isActive ? 'green' : 'gray'} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/master/clients/${account._id}`} className="text-primary hover:underline">Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-primary" />
              <h3 className="text-sm font-semibold">Wallet Ledger</h3>
            </div>
            <span className="text-xs text-muted-foreground">{walletTransactions.length} entries</span>
          </div>
          {!walletTransactions.length ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No wallet transactions recorded for this client.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Transaction</th>
                    <th className="px-4 py-3 text-right font-semibold">Credit</th>
                    <th className="px-4 py-3 text-right font-semibold">Debit</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {walletTransactions.map((txn) => (
                    <tr key={txn._id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <p className="font-medium">{WALLET_TYPE_LABEL[txn.type] || txn.type}</p>
                        <p className="max-w-xs truncate text-xs text-muted-foreground">{txn.description || txn.reason || txn.referenceId || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {txn.creditAmount ? fmtMoney(txn.creditAmount) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">
                        {txn.debitAmount ? fmtMoney(txn.debitAmount) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">{fmtMoney(txn.balanceAfter)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(txn.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              <h3 className="text-sm font-semibold">Payment Transactions</h3>
            </div>
            <span className="text-xs text-muted-foreground">{payments.length} records</span>
          </div>
          {!payments.length ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No payment transactions recorded for this client.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Purpose</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 text-right font-semibold">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => (
                    <tr key={payment._id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs">{payment.razorpayOrderId || '-'}</p>
                        <p className="font-mono text-xs text-muted-foreground">{payment.razorpayPaymentId || 'Payment pending'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={(payment.purpose || '-').replace('_', ' ')} color="blue" />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtMoney(payment.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge label={payment.status || 'unknown'} color={PAYMENT_STATUS_COLOR[payment.status] || 'gray'} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(payment.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={payment.status !== 'paid' || downloadingPaymentId === payment._id}
                          onClick={() => downloadPaymentPdf(payment)}
                        >
                          <Download size={13} /> {downloadingPaymentId === payment._id ? 'Downloading...' : 'PDF'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Subscription History</h3>
          </div>
          <span className="text-xs text-muted-foreground">{subscriptionHistory.length} subscriptions</span>
        </div>
        {!subscriptionHistory.length ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No subscription history recorded for this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Billing</th>
                  <th className="px-4 py-3 text-right font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subscriptionHistory.map((item) => {
                  const status = displaySubscriptionStatus(item);
                  const canModify = !['cancelled'].includes(item.status);
                  return (
                    <tr key={item._id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.planId?.name || 'Unknown plan'}</p>
                        <p className="break-all text-xs text-muted-foreground">{item._id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{fmtDate(item.startDate)} to {fmtDate(item.endDate)}</p>
                        <p className="text-xs text-muted-foreground">Created {fmtDateTime(item.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">{item.billingCycleSnapshot || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtMoney(item.priceSnapshot)}</td>
                      <td className="px-4 py-3">
                        <Badge label={status} color={SUBSCRIPTION_STATUS_COLOR[status] || 'gray'} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.cancelReason || '-'}</td>
                      <td className="px-4 py-3">
                        {canModify ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openExtendSubscription(item)}>Extend</Button>
                            <Button variant="outline" size="sm" onClick={() => openCancelSubscription('cancel', item)}>Cancel</Button>
                            {role === 'admin' && (
                              <Button variant="outline" size="sm" onClick={() => openCancelSubscription('revoke', item)}>Revoke</Button>
                            )}
                          </div>
                        ) : (
                          <span className="block text-right text-xs text-muted-foreground">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} title={subscription ? 'Change subscription' : 'Assign subscription'}
        footer={
          <>
            <Button variant="outline" onClick={() => setSubscriptionOpen(false)} disabled={savingSubscription}>Cancel</Button>
            <Button onClick={submitSubscription} disabled={savingSubscription}>
              {savingSubscription ? 'Saving...' : 'Save subscription'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Plan"
            value={subscriptionForm.planId}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, planId: e.target.value })}
          >
            <option value="">Select a plan...</option>
            {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
          <Select
            label="Billing cycle"
            value={subscriptionForm.billingCycle}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, billingCycle: e.target.value })}
          >
            {BILLING_CYCLES.map((cycle) => <option key={cycle.value} value={cycle.value}>{cycle.label}</option>)}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Manual start date"
              type="date"
              value={subscriptionForm.startDate}
              onChange={(e) => setSubscriptionForm({ ...subscriptionForm, startDate: e.target.value })}
            />
            <Input
              label="Manual end date"
              type="date"
              value={subscriptionForm.endDate}
              onChange={(e) => setSubscriptionForm({ ...subscriptionForm, endDate: e.target.value })}
            />
          </div>
          {subscriptionError && <p className="text-sm text-red-500">{subscriptionError}</p>}
        </div>
      </Modal>

      <Modal open={extendOpen} onClose={() => setExtendOpen(false)} title="Extend subscription"
        footer={
          <>
            <Button variant="outline" onClick={() => setExtendOpen(false)} disabled={extendingSubscription}>Cancel</Button>
            <Button onClick={submitExtendSubscription} disabled={extendingSubscription}>
              {extendingSubscription ? 'Extending...' : 'Extend subscription'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="New end date"
            type="date"
            value={extendForm.newEndDate}
            onChange={(e) => setExtendForm({ ...extendForm, newEndDate: e.target.value })}
          />
          {extendError && <p className="text-sm text-red-500">{extendError}</p>}
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`${cancelAction === 'revoke' ? 'Revoke' : 'Cancel'} subscription`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancellingSubscription}>Cancel</Button>
            <Button onClick={submitCancelSubscription} disabled={cancellingSubscription}>
              {cancellingSubscription ? 'Saving...' : cancelAction === 'revoke' ? 'Revoke subscription' : 'Cancel subscription'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{cancelTarget?.planId?.name || 'Subscription'}</p>
            <p className="text-xs text-muted-foreground">{fmtDate(cancelTarget?.startDate)} to {fmtDate(cancelTarget?.endDate)}</p>
          </div>
          <Textarea
            label="Reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          {cancelError && <p className="text-sm text-red-500">{cancelError}</p>}
        </div>
      </Modal>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust wallet balance"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={adjusting}>{adjusting ? 'Saving...' : 'Confirm adjustment'}</Button>
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
          <Input label="Reason (required - logged to audit trail)" value={adjust.reason}
            onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset client password"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>Close</Button>
            <Button onClick={submitReset} disabled={resetting || !resetUser}>
              {resetting ? 'Resetting...' : 'Reset password'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{resetUser?.name || 'Client user'}</p>
            <p className="break-all text-muted-foreground">{resetUser?.email}</p>
          </div>
          <Input
            label="New password"
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          {resetMessage && <p className="text-sm text-green-600">{resetMessage}</p>}
        </div>
      </Modal>

      <Modal open={createUserOpen} onClose={() => setCreateUserOpen(false)} title="Create client login"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateUserOpen(false)} disabled={creatingUser}>Cancel</Button>
            <Button onClick={submitCreateUser} disabled={creatingUser}>
              {creatingUser ? 'Creating...' : 'Create login'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Name"
            value={createUserForm.name}
            onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={createUserForm.email}
            onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
          />
          <Select
            value={createUserForm.role}
            onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value })}
          >
            <option value="client_owner">Owner</option>
            <option value="client_user">User</option>
          </Select>
          <Input
            label="Initial password"
            type="password"
            value={createUserForm.password}
            onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
          />
          {createUserError && <p className="text-sm text-red-500">{createUserError}</p>}
        </div>
      </Modal>

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Edit client details"
        footer={
          <>
            <Button variant="outline" onClick={() => setDetailsOpen(false)} disabled={savingDetails}>Cancel</Button>
            <Button onClick={submitDetails} disabled={savingDetails}>
              {savingDetails ? 'Saving...' : 'Save details'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Client / company name" value={detailsForm.name || ''} onChange={(e) => setDetailsForm({ ...detailsForm, name: e.target.value })} />
            <Input label="Contact person" value={detailsForm.contactPerson || ''} onChange={(e) => setDetailsForm({ ...detailsForm, contactPerson: e.target.value })} />
            <Input label="Contact email" type="email" value={detailsForm.contactEmail || ''} onChange={(e) => setDetailsForm({ ...detailsForm, contactEmail: e.target.value })} />
            <Input label="Billing email" type="email" value={detailsForm.billingEmail || ''} onChange={(e) => setDetailsForm({ ...detailsForm, billingEmail: e.target.value })} />
            <Input label="Contact phone" value={detailsForm.contactPhone || ''} onChange={(e) => setDetailsForm({ ...detailsForm, contactPhone: e.target.value })} />
            <Input label="Website" value={detailsForm.website || ''} onChange={(e) => setDetailsForm({ ...detailsForm, website: e.target.value })} />
            <Input label="GST / Tax ID" value={detailsForm.taxId || ''} onChange={(e) => setDetailsForm({ ...detailsForm, taxId: e.target.value })} />
            <Input label="Industry" value={detailsForm.industry || ''} onChange={(e) => setDetailsForm({ ...detailsForm, industry: e.target.value })} />
            <Input label="Timezone" value={detailsForm.timezone || ''} onChange={(e) => setDetailsForm({ ...detailsForm, timezone: e.target.value })} />
            <Input label="Postal code" value={detailsForm.postalCode || ''} onChange={(e) => setDetailsForm({ ...detailsForm, postalCode: e.target.value })} />
          </div>
          <Input label="Address line 1" value={detailsForm.addressLine1 || ''} onChange={(e) => setDetailsForm({ ...detailsForm, addressLine1: e.target.value })} />
          <Input label="Address line 2" value={detailsForm.addressLine2 || ''} onChange={(e) => setDetailsForm({ ...detailsForm, addressLine2: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="City" value={detailsForm.city || ''} onChange={(e) => setDetailsForm({ ...detailsForm, city: e.target.value })} />
            <Input label="State" value={detailsForm.state || ''} onChange={(e) => setDetailsForm({ ...detailsForm, state: e.target.value })} />
            <Input label="Country" value={detailsForm.country || ''} onChange={(e) => setDetailsForm({ ...detailsForm, country: e.target.value })} />
          </div>
          <Textarea label="Notes" value={detailsForm.notes || ''} onChange={(e) => setDetailsForm({ ...detailsForm, notes: e.target.value })} />
          {detailsError && <p className="text-sm text-red-500">{detailsError}</p>}
        </div>
      </Modal>

      <Modal open={manualAccountOpen} onClose={() => setManualAccountOpen(false)} title="Add WhatsApp account manually"
        footer={
          <>
            <Button variant="outline" onClick={() => setManualAccountOpen(false)} disabled={savingAccount}>Cancel</Button>
            <Button onClick={submitManualAccount} disabled={savingAccount}>
              {savingAccount ? 'Connecting...' : 'Connect account'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Account name"
            value={manualAccountForm.name}
            onChange={(e) => setManualAccountForm({ ...manualAccountForm, name: e.target.value })}
          />
          <Input
            label="WABA ID"
            value={manualAccountForm.wabaId}
            onChange={(e) => setManualAccountForm({ ...manualAccountForm, wabaId: e.target.value })}
          />
          <Input
            label="Phone number ID"
            value={manualAccountForm.phoneNumberId}
            onChange={(e) => setManualAccountForm({ ...manualAccountForm, phoneNumberId: e.target.value })}
          />
          <Input
            label="Permanent access token"
            type="password"
            value={manualAccountForm.accessToken}
            onChange={(e) => setManualAccountForm({ ...manualAccountForm, accessToken: e.target.value })}
          />
          <Input
            label="Display phone"
            value={manualAccountForm.phone}
            onChange={(e) => setManualAccountForm({ ...manualAccountForm, phone: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Timezone"
              value={manualAccountForm.timezone}
              onChange={(e) => setManualAccountForm({ ...manualAccountForm, timezone: e.target.value })}
            />
            <Input
              label="Industry"
              value={manualAccountForm.industry}
              onChange={(e) => setManualAccountForm({ ...manualAccountForm, industry: e.target.value })}
            />
          </div>
          {accountError && <p className="text-sm text-red-500">{accountError}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
