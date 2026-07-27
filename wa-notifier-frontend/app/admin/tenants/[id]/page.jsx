'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Select, Input, Modal, Badge, Spinner } from '@/components/ui';
import { ArrowLeft, Wallet as WalletIcon, ShieldOff, ShieldCheck, KeyRound, Users, UserPlus, PhoneCall, Building2, MessageCircle, Plus } from 'lucide-react';
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
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';
const fmtMoney = (value) => `INR ${Number(value || 0).toLocaleString('en-IN')}`;

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
  const [accounts, setAccounts] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [assigning, setAssigning] = useState(false);
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
  const [error, setError] = useState('');
  const signupRef = useRef({ code: '', setup: null, submitting: false, redirectUri: '' });
  const waitTimerRef = useRef(null);

  const load = async () => {
    const [tenantRes, plansRes, walletRes, subsRes, accountsRes, usersRes] = await Promise.all([
      api.get(`/tenants/${id}`),
      api.get('/plans'),
      api.get(`/wallet/${id}`),
      api.get(`/subscriptions/tenant/${id}`),
      api.get(`/whatsapp-accounts/tenant/${id}`),
      api.get(`/auth/tenant-users/${id}`),
    ]);
    setTenant(tenantRes.data);
    setPlans(plansRes.data);
    setWallet(walletRes.data);
    setSubscription(subsRes.data?.[0] || null);
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
          <div className="mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Client Details</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Company name" value={tenant.name} />
            <DetailItem label="Slug" value={tenant.slug} />
            <DetailItem label="Contact email" value={tenant.contactEmail} />
            <DetailItem label="Contact phone" value={tenant.contactPhone} />
            <DetailItem label="Industry" value={tenant.industry} />
            <DetailItem label="Timezone" value={tenant.timezone} />
            <DetailItem label="Created" value={fmtDateTime(tenant.createdAt)} />
            <DetailItem label="Last updated" value={fmtDateTime(tenant.updatedAt)} />
            <DetailItem label="Client ID" value={tenant._id} wide />
            <DetailItem label="Notes" value={tenant.notes} wide />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Subscription</h3>
          {subscription ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Plan" value={subscription.planId?.name} />
              <DetailItem label="Status" value={subscription.status} />
              <DetailItem label="Start date" value={fmtDate(subscription.startDate)} />
              <DetailItem label="Renewal date" value={fmtDate(subscription.endDate)} />
              <DetailItem label="Price snapshot" value={fmtMoney(subscription.priceSnapshot)} />
              <DetailItem label="Billing cycle" value={subscription.billingCycleSnapshot} />
              <DetailItem label="Subscription ID" value={subscription._id} wide />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">No plan assigned yet.</p>
          )}
          <div className="mt-4 flex gap-2">
            <Select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} className="flex-1">
              <option value="">Select a plan...</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </Select>
            <Button onClick={assignPlan} disabled={!selectedPlan || assigning}>
              {assigning ? 'Assigning...' : subscription ? 'Change plan' : 'Assign plan'}
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
