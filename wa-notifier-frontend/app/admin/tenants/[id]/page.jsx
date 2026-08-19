'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Select, Input, Modal, Badge, Spinner, Textarea, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { ArrowLeft, Wallet as WalletIcon, ShieldOff, ShieldCheck, KeyRound, Users, UserPlus, PhoneCall, Building2, MessageCircle, Plus, Pencil, Receipt, CreditCard, CalendarDays, Download, Trash2, RotateCcw } from 'lucide-react';
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
const WALLET_TYPE_OPTIONS = Object.keys(WALLET_TYPE_LABEL);
const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const metaApiVersion = process.env.NEXT_PUBLIC_META_API_VERSION || 'v25.0';
const metaSolutionId = process.env.NEXT_PUBLIC_META_SOLUTION_ID;
const SIGNUP_FEATURE_TYPES = {
  cloud_api: 'whatsapp_embedded_signup',
  business_app: 'whatsapp_business_app_onboarding',
};
const blankAccountForm = {
  name: '',
  businessId: '',
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
const DETAIL_TABS = [
  { key: 'details', label: 'Details', icon: Building2 },
  { key: 'subscription', label: 'Subscription', icon: CreditCard },
  { key: 'wallet', label: 'Wallet', icon: WalletIcon },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'whatsapp', label: 'WhatsApp', icon: PhoneCall },
  { key: 'ledger', label: 'Ledger', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'history', label: 'History', icon: CalendarDays },
];
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';
const fmtMoney = (value) => `INR ${Number(value || 0).toLocaleString('en-IN')}`;
const dateForInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const text = (value) => String(value || '').toLowerCase();

function displaySubscriptionStatus(item) {
  if (!item) return '-';
  if (item.status === 'active' && item.endDate && new Date(item.endDate) < new Date()) return 'expired';
  return item.status || 'unknown';
}

function canModifySubscription(item) {
  const status = displaySubscriptionStatus(item);
  const reason = text(item?.cancelReason);
  return item && !['cancelled', 'expired'].includes(status) && !reason.includes('revoked');
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
  const router = useRouter();
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const [activeTab, setActiveTab] = useState('details');
  const [tenant, setTenant] = useState(null);
  const [plans, setPlans] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionHistory, setSubscriptionHistory] = useState([]);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletLedger, setWalletLedger] = useState({ items: [], total: 0, page: 1, limit: 25, totalPages: 1 });
  const [walletFilters, setWalletFilters] = useState({ from: '', to: '', type: 'all', direction: 'all' });
  const [walletSearch, setWalletSearch] = useState('');
  const [walletSort, setWalletSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [walletPage, setWalletPage] = useState(1);
  const [walletLimit, setWalletLimit] = useState(25);
  const [downloadingWallet, setDownloadingWallet] = useState('');
  const [payments, setPayments] = useState([]);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [paymentPurposeFilter, setPaymentPurposeFilter] = useState('all');
  const [paymentSort, setPaymentSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [downloadingPaymentId, setDownloadingPaymentId] = useState(null);
  const [downloadingBillingStatement, setDownloadingBillingStatement] = useState(false);
  const [downloadingSubscriptionId, setDownloadingSubscriptionId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState('all');
  const [accountSort, setAccountSort] = useState({ key: 'account', direction: 'asc' });
  const [tenantUsers, setTenantUsers] = useState([]);
  const [tenantUserSearch, setTenantUserSearch] = useState('');
  const [tenantUserRoleFilter, setTenantUserRoleFilter] = useState('all');
  const [tenantUserStatusFilter, setTenantUserStatusFilter] = useState('all');
  const [tenantUserSort, setTenantUserSort] = useState({ key: 'user', direction: 'asc' });
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [subscriptionSort, setSubscriptionSort] = useState({ key: 'createdAt', direction: 'desc' });
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
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '', role: 'client_user', isActive: true });
  const [savingUser, setSavingUser] = useState(false);
  const [editUserError, setEditUserError] = useState('');
  const [userBusyId, setUserBusyId] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseForm, setReverseForm] = useState({ action: 'refund', reason: '' });
  const [reversingTxn, setReversingTxn] = useState(false);
  const [reverseError, setReverseError] = useState('');
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
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [deleteClientError, setDeleteClientError] = useState('');
  const [error, setError] = useState('');
  const signupRef = useRef({ code: '', setup: null, submitting: false, redirectUri: '', onboardingMode: 'cloud_api' });
  const waitTimerRef = useRef(null);

  const walletQuery = (page = walletPage, filters = walletFilters, limit = walletLimit) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.direction !== 'all') params.set('direction', filters.direction);
    return params.toString();
  };

  const loadWalletLedger = async (page = walletPage, filters = walletFilters, limit = walletLimit) => {
    const { data } = await api.get(`/wallet/${id}/transactions?${walletQuery(page, filters, limit)}`);
    const next = {
      items: data?.items || [],
      total: data?.total || 0,
      page: data?.page || page,
      limit: data?.limit || limit,
      totalPages: data?.totalPages || 1,
    };
    setWalletLedger(next);
    setWalletTransactions(next.items);
  };

  const load = async () => {
    const [tenantRes, plansRes, walletRes, walletTxRes, subsRes, paymentsRes, accountsRes, usersRes] = await Promise.all([
      api.get(`/tenants/${id}`),
      api.get('/plans'),
      api.get(`/wallet/${id}`),
      api.get(`/wallet/${id}/transactions?${walletQuery()}`),
      api.get(`/subscriptions/tenant/${id}`),
      api.get(`/payments?tenantId=${id}`),
      api.get(`/whatsapp-accounts/tenant/${id}`),
      api.get(`/auth/tenant-users/${id}`),
    ]);
    const subscriptions = subsRes.data || [];
    setTenant(tenantRes.data);
    setPlans(plansRes.data);
    setWallet(walletRes.data);
    setWalletLedger({
      items: walletTxRes.data?.items || [],
      total: walletTxRes.data?.total || 0,
      page: walletTxRes.data?.page || walletPage,
      limit: walletTxRes.data?.limit || walletLimit,
      totalPages: walletTxRes.data?.totalPages || 1,
    });
    setWalletTransactions(walletTxRes.data?.items || []);
    setSubscription(subscriptions.find((item) => item.status === 'active') || subscriptions[0] || null);
    setSubscriptionHistory(subscriptions);
    setPayments(paymentsRes.data || []);
    setAccounts(accountsRes.data || []);
    setTenantUsers(usersRes.data || []);
  };

  useEffect(() => { load(); }, [id]);

  const filteredTenantUsers = useMemo(() => {
    const query = text(tenantUserSearch.trim());
    return tenantUsers.filter((loginUser) => {
      const matchesSearch = !query
        || text(loginUser.name).includes(query)
        || text(loginUser.email).includes(query)
        || text(loginUser.role).includes(query);
      const matchesRole = tenantUserRoleFilter === 'all' || loginUser.role === tenantUserRoleFilter;
      const matchesStatus = tenantUserStatusFilter === 'all'
        || (tenantUserStatusFilter === 'active' && loginUser.isActive)
        || (tenantUserStatusFilter === 'inactive' && !loginUser.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [tenantUsers, tenantUserRoleFilter, tenantUserSearch, tenantUserStatusFilter]);

  const sortedTenantUsers = useMemo(() => sortItems(filteredTenantUsers, tenantUserSort, {
    user: (loginUser) => loginUser.name || loginUser.email,
    role: (loginUser) => loginUser.role,
    status: (loginUser) => Boolean(loginUser.isActive),
    lastLoginAt: (loginUser) => loginUser.lastLoginAt || '',
  }), [filteredTenantUsers, tenantUserSort]);
  const tenantUsersPage = usePagination(sortedTenantUsers, {
    initialPageSize: 10,
    resetKey: `${tenantUserSearch}|${tenantUserRoleFilter}|${tenantUserStatusFilter}|${tenantUserSort.key}|${tenantUserSort.direction}`,
  });

  const filteredAccounts = useMemo(() => {
    const query = text(accountSearch.trim());
    return accounts.filter((account) => {
      const matchesSearch = !query
        || text(account.name).includes(query)
        || text(account.phone).includes(query)
        || text(account.wabaId).includes(query)
        || text(account.phoneNumberId).includes(query)
        || text(account.timezone).includes(query);
      const matchesStatus = accountStatusFilter === 'all'
        || (accountStatusFilter === 'active' && account.isActive)
        || (accountStatusFilter === 'inactive' && !account.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [accountSearch, accountStatusFilter, accounts]);

  const sortedAccounts = useMemo(() => sortItems(filteredAccounts, accountSort, {
    account: (account) => account.name,
    phone: (account) => account.phone,
    meta: (account) => account.wabaId || account.phoneNumberId,
    timezone: (account) => account.timezone,
    status: (account) => Boolean(account.isActive),
  }), [accountSort, filteredAccounts]);
  const accountsPage = usePagination(sortedAccounts, {
    initialPageSize: 10,
    resetKey: `${accountSearch}|${accountStatusFilter}|${accountSort.key}|${accountSort.direction}`,
  });

  const filteredWalletTransactions = useMemo(() => {
    const query = text(walletSearch.trim());
    return walletTransactions.filter((txn) => !query
      || text(WALLET_TYPE_LABEL[txn.type] || txn.type).includes(query)
      || text(txn.status).includes(query)
      || text(txn.description).includes(query)
      || text(txn.reason).includes(query)
      || text(txn.referenceId).includes(query)
      || text(txn._id).includes(query));
  }, [walletSearch, walletTransactions]);

  const sortedWalletTransactions = useMemo(() => sortItems(filteredWalletTransactions, walletSort, {
    transaction: (txn) => WALLET_TYPE_LABEL[txn.type] || txn.type,
    status: (txn) => txn.status || 'completed',
    credit: (txn) => txn.creditAmount || 0,
    debit: (txn) => txn.debitAmount || 0,
    balance: (txn) => txn.balanceAfter || 0,
    createdAt: (txn) => txn.createdAt,
  }), [filteredWalletTransactions, walletSort]);

  const paymentPurposeOptions = useMemo(() => (
    Array.from(new Set(payments.map((payment) => payment.purpose).filter(Boolean))).sort()
  ), [payments]);

  const filteredPayments = useMemo(() => {
    const query = text(paymentSearch.trim());
    return payments.filter((payment) => {
      const matchesSearch = !query
        || text(payment.razorpayOrderId).includes(query)
        || text(payment.razorpayPaymentId).includes(query)
        || text(payment.purpose).includes(query)
        || text(payment.status).includes(query)
        || text(payment._id).includes(query);
      const matchesStatus = paymentStatusFilter === 'all' || payment.status === paymentStatusFilter;
      const matchesPurpose = paymentPurposeFilter === 'all' || payment.purpose === paymentPurposeFilter;
      return matchesSearch && matchesStatus && matchesPurpose;
    });
  }, [paymentPurposeFilter, paymentSearch, paymentStatusFilter, payments]);

  const sortedPayments = useMemo(() => sortItems(filteredPayments, paymentSort, {
    payment: (payment) => payment.razorpayOrderId || payment.razorpayPaymentId,
    purpose: (payment) => payment.purpose,
    amount: (payment) => payment.amount,
    status: (payment) => payment.status,
    createdAt: (payment) => payment.createdAt,
  }), [filteredPayments, paymentSort]);
  const paymentsPage = usePagination(sortedPayments, {
    initialPageSize: 10,
    resetKey: `${paymentSearch}|${paymentStatusFilter}|${paymentPurposeFilter}|${paymentSort.key}|${paymentSort.direction}`,
  });

  const filteredSubscriptionHistory = useMemo(() => {
    const query = text(subscriptionSearch.trim());
    return subscriptionHistory.filter((item) => {
      const status = displaySubscriptionStatus(item);
      const matchesSearch = !query
        || text(item.planId?.name).includes(query)
        || text(item._id).includes(query)
        || text(item.billingCycleSnapshot).includes(query)
        || text(status).includes(query)
        || text(item.cancelReason).includes(query);
      const matchesStatus = subscriptionStatusFilter === 'all' || status === subscriptionStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [subscriptionHistory, subscriptionSearch, subscriptionStatusFilter]);

  const sortedSubscriptionHistory = useMemo(() => sortItems(filteredSubscriptionHistory, subscriptionSort, {
    plan: (item) => item.planId?.name,
    period: (item) => item.startDate,
    billing: (item) => item.billingCycleSnapshot,
    price: (item) => item.priceSnapshot || 0,
    status: displaySubscriptionStatus,
    reason: (item) => item.cancelReason,
    createdAt: (item) => item.createdAt,
  }), [filteredSubscriptionHistory, subscriptionSort]);
  const subscriptionHistoryPage = usePagination(sortedSubscriptionHistory, {
    initialPageSize: 10,
    resetKey: `${subscriptionSearch}|${subscriptionStatusFilter}|${subscriptionSort.key}|${subscriptionSort.direction}`,
  });

  const clearWaitTimer = () => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  };

  const resetSignupState = () => {
    clearWaitTimer();
    signupRef.current = { code: '', setup: null, submitting: false, redirectUri: '', onboardingMode: 'cloud_api' };
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

  const confirmDeleteClient = async () => {
    setDeleteClientError('');
    setDeletingClient(true);
    try {
      await api.delete(`/tenants/${id}`);
      setDeleteClientOpen(false);
      router.push('/admin/tenants');
    } catch (err) {
      setDeleteClientError(err?.response?.data?.message || 'Could not delete client');
    } finally {
      setDeletingClient(false);
    }
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

  const downloadBlob = (data, headers, fallbackFilename) => {
    const disposition = headers?.['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || fallbackFilename;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBillingStatement = async () => {
    setError('');
    setDownloadingBillingStatement(true);
    try {
      const { data, headers } = await api.get(`/payments/tenants/${id}/billing-statement.pdf`, { responseType: 'blob' });
      downloadBlob(data, headers, `${tenant?.name || 'client'}-billing-statement.pdf`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not download billing statement');
    } finally {
      setDownloadingBillingStatement(false);
    }
  };

  const downloadSubscriptionInvoice = async (subscriptionItem) => {
    setError('');
    setDownloadingSubscriptionId(subscriptionItem._id);
    try {
      const { data, headers } = await api.get(`/payments/subscriptions/${subscriptionItem._id}/invoice.pdf`, { responseType: 'blob' });
      downloadBlob(data, headers, `subscription-invoice-${subscriptionItem._id}.pdf`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not download subscription invoice');
    } finally {
      setDownloadingSubscriptionId(null);
    }
  };

  const downloadWalletFile = async (kind) => {
    setError('');
    setDownloadingWallet(kind);
    try {
      const endpoint = kind === 'statement'
        ? `/wallet/${id}/statement.pdf?${walletQuery(1, walletFilters, walletLimit)}`
        : `/wallet/${id}/transactions/export.${kind}?${walletQuery(1, walletFilters, walletLimit)}`;
      const { data, headers } = await api.get(endpoint, { responseType: 'blob' });
      downloadBlob(data, headers, `${tenant?.name || 'client'}-wallet-${kind}.${kind === 'csv' ? 'csv' : 'pdf'}`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not download wallet file');
    } finally {
      setDownloadingWallet('');
    }
  };

  const applyWalletFilters = async () => {
    setError('');
    setWalletPage(1);
    try {
      await loadWalletLedger(1, walletFilters, walletLimit);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load wallet ledger');
    }
  };

  const clearWalletFilters = async () => {
    const cleared = { from: '', to: '', type: 'all', direction: 'all' };
    setWalletFilters(cleared);
    setWalletSearch('');
    setWalletPage(1);
    setError('');
    try {
      await loadWalletLedger(1, cleared, walletLimit);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load wallet ledger');
    }
  };

  const changeWalletPage = async (page) => {
    const nextPage = Math.min(Math.max(1, page), walletLedger.totalPages || 1);
    setWalletPage(nextPage);
    setError('');
    try {
      await loadWalletLedger(nextPage, walletFilters, walletLimit);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load wallet ledger');
    }
  };

  const changeWalletLimit = async (limit) => {
    const nextLimit = Number(limit);
    setWalletLimit(nextLimit);
    setWalletPage(1);
    setError('');
    try {
      await loadWalletLedger(1, walletFilters, nextLimit);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load wallet ledger');
    }
  };

  const openReverse = (txn) => {
    setReverseTarget(txn);
    setReverseForm({ action: 'refund', reason: '' });
    setReverseError('');
  };

  const submitReverse = async () => {
    setReverseError('');
    if (!reverseForm.reason.trim()) { setReverseError('Reason is required'); return; }
    setReversingTxn(true);
    try {
      await api.post(`/wallet/${id}/transactions/${reverseTarget._id}/reverse`, {
        ...reverseForm,
        reason: reverseForm.reason.trim(),
      });
      setReverseTarget(null);
      await load();
    } catch (err) {
      setReverseError(err?.response?.data?.message || 'Could not refund/reverse transaction');
    } finally {
      setReversingTxn(false);
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

  const openEditUser = (loginUser) => {
    setEditUserTarget(loginUser);
    setEditUserForm({
      name: loginUser.name || '',
      email: loginUser.email || '',
      role: loginUser.role || 'client_user',
      isActive: loginUser.isActive !== false,
    });
    setEditUserError('');
    setEditUserOpen(true);
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

  const submitEditUser = async () => {
    setEditUserError('');
    if (!editUserForm.name.trim()) { setEditUserError('Name is required'); return; }
    if (!editUserForm.email.trim()) { setEditUserError('Email is required'); return; }
    setSavingUser(true);
    try {
      await api.patch(`/auth/tenant-users/${editUserTarget._id}`, {
        ...editUserForm,
        name: editUserForm.name.trim(),
        email: editUserForm.email.trim(),
      });
      setEditUserOpen(false);
      setEditUserTarget(null);
      await load();
    } catch (err) {
      setEditUserError(err?.response?.data?.message || 'Could not update login user');
    } finally {
      setSavingUser(false);
    }
  };

  const toggleTenantUserActive = async (loginUser) => {
    setError('');
    setUserBusyId(loginUser._id);
    try {
      await api.patch(`/auth/tenant-users/${loginUser._id}`, { isActive: !loginUser.isActive });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update login user');
    } finally {
      setUserBusyId(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    setError('');
    try {
      await api.delete(`/auth/tenant-users/${deleteUserTarget._id}`);
      setDeleteUserTarget(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not delete login user');
      setDeleteUserTarget(null);
    } finally {
      setDeletingUser(false);
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
    const businessId = current.setup?.business_id || current.setup?.businessId;

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
      const embeddedSignupPayload = {
        tenantId: id,
        code: current.code,
        wabaId,
        businessId,
        phoneNumberId,
        redirectUri: current.redirectUri,
        onboardingMode: current.onboardingMode,
        name: current.setup?.business_name || current.setup?.businessName || `${tenant?.name || 'Client'} WhatsApp`,
      };
      console.log('[EmbeddedSignupDebug] Admin sending embedded signup payload to backend', embeddedSignupPayload);
      const { data: account } = await api.post('/whatsapp-accounts/embedded-signup', embeddedSignupPayload);
      console.log('[EmbeddedSignupDebug] Admin embedded signup backend response', account);
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
      console.log('[EmbeddedSignupDebug] Admin received Meta Embedded Signup window message', {
        origin: event.origin,
        rawData: event.data,
        parsedPayload: payload,
      });
      const setupData = normalizeEmbeddedSignupData(payload.data);
      console.log('[EmbeddedSignupDebug] Admin normalized Meta setup data', setupData);

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

  const startEmbeddedSignup = (onboardingMode = 'cloud_api') => {
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
    signupRef.current.onboardingMode = onboardingMode;
    setConnectingAccount(true);
    setAccountStatus('Opening Facebook Embedded Signup...');

    const redirectUri = `${window.location.origin}/master/meta-embedded-signup`;
    signupRef.current.redirectUri = redirectUri;
    console.log('[EmbeddedSignupDebug] Admin opening Meta Embedded Signup', {
      tenantId: id,
      onboardingMode,
      metaAppId,
      metaConfigId,
      metaApiVersion,
      metaSolutionId,
      redirectUri,
      extras: {
        setup: metaSolutionId ? { solutionID: metaSolutionId } : {},
        featureType: SIGNUP_FEATURE_TYPES[onboardingMode] || SIGNUP_FEATURE_TYPES.cloud_api,
        sessionInfoVersion: '3',
      },
    });

    window.FB.login((response) => {
      console.log('[EmbeddedSignupDebug] Admin FB.login response', response);
      if (response?.authResponse?.code) {
        signupRef.current.code = response.authResponse.code;
        console.log('[EmbeddedSignupDebug] Admin received Meta authorization code', response.authResponse.code);
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
        setup: metaSolutionId ? { solutionID: metaSolutionId } : {},
        featureType: SIGNUP_FEATURE_TYPES[onboardingMode] || SIGNUP_FEATURE_TYPES.cloud_api,
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
            {role === 'admin' && (
              <Button variant="danger" onClick={() => { setDeleteClientError(''); setDeleteClientOpen(true); }}>
                <Trash2 size={15} /> Delete
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 overflow-x-auto border-b border-border" role="tablist" aria-label="Client detail sections">
        <div className="flex min-w-max gap-1">
          {DETAIL_TABS.map(({ key, label, icon: Icon }) => {
            const selected = activeTab === key;
            return (
              <button
                key={key}
                id={`${key}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${key}-panel`}
                onClick={() => setActiveTab(key)}
                className={`inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'details' && (
        <Card id="details-panel" role="tabpanel" aria-labelledby="details-tab" className="p-5">
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
      )}

      {activeTab === 'subscription' && (
        <Card id="subscription-panel" role="tabpanel" aria-labelledby="subscription-tab" className="p-5">
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
          {canModifySubscription(subscription) && (
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
      )}

      {activeTab === 'wallet' && (
        <Card id="wallet-panel" role="tabpanel" aria-labelledby="wallet-tab" className="p-5">
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
      )}

      {activeTab === 'users' && (
        <Card id="users-panel" role="tabpanel" aria-labelledby="users-tab" className="p-5">
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
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px]">
                <Input placeholder="Search user name, email, role..." value={tenantUserSearch} onChange={(e) => setTenantUserSearch(e.target.value)} />
                <Select value={tenantUserRoleFilter} onChange={(e) => setTenantUserRoleFilter(e.target.value)}>
                  <option value="all">All roles</option>
                  <option value="client_owner">Owner</option>
                  <option value="client_user">User</option>
                </Select>
                <Select value={tenantUserStatusFilter} onChange={(e) => setTenantUserStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <SortableTh label="User" sortKey="user" sort={tenantUserSort} onSort={setTenantUserSort} className="px-0 pr-3" />
                      <SortableTh label="Role" sortKey="role" sort={tenantUserSort} onSort={setTenantUserSort} className="px-0 pr-3" />
                      <SortableTh label="Status" sortKey="status" sort={tenantUserSort} onSort={setTenantUserSort} className="px-0 pr-3" />
                      <SortableTh label="Last login" sortKey="lastLoginAt" sort={tenantUserSort} onSort={setTenantUserSort} className="px-0 pr-3" />
                      <th className="py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!sortedTenantUsers.length && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No login users match these filters.</td></tr>
                    )}
                    {tenantUsersPage.pageItems.map((u) => {
                    const busy = userBusyId === u._id;
                    return (
                      <tr key={u._id}>
                        <td className="py-3 pr-3">
                          <p className="font-medium">{u.name || '-'}</p>
                          <p className="break-all text-xs text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="py-3 pr-3">{ROLE_LABEL[u.role] || u.role}</td>
                        <td className="py-3 pr-3">
                          <Badge label={u.isActive ? 'Active' : 'Inactive'} color={u.isActive ? 'green' : 'gray'} />
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
                        <td className="py-3 text-right">
                          {role === 'admin' ? (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button variant="outline" size="sm" onClick={() => openEditUser(u)}>
                                <Pencil size={14} /> Edit
                              </Button>
                              <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleTenantUserActive(u)}>
                                {u.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                {u.isActive ? 'Disable' : 'Activate'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openReset(u)}>
                                <KeyRound size={14} /> Reset
                              </Button>
                              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteUserTarget(u)}>
                                <Trash2 size={14} /> Delete
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Admin only</span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationControls {...tenantUsersPage} onPageChange={tenantUsersPage.setPage} onPageSizeChange={tenantUsersPage.setPageSize} />
            </>
          )}
        </Card>
      )}

      {activeTab === 'whatsapp' && (
        <Card id="whatsapp-panel" role="tabpanel" aria-labelledby="whatsapp-tab" className="p-5">
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
              <Button size="sm" onClick={() => startEmbeddedSignup('cloud_api')} disabled={connectingAccount}>
                <MessageCircle size={14} /> {connectingAccount ? 'Connecting...' : 'New/free number'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => startEmbeddedSignup('business_app')} disabled={connectingAccount}>
                <MessageCircle size={14} /> Existing Business App
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
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
              <Input placeholder="Search account, phone, WABA, phone ID..." value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} />
              <Select value={accountStatusFilter} onChange={(e) => setAccountStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortableTh label="Account" sortKey="account" sort={accountSort} onSort={setAccountSort} />
                    <SortableTh label="Phone" sortKey="phone" sort={accountSort} onSort={setAccountSort} />
                    <SortableTh label="Meta IDs" sortKey="meta" sort={accountSort} onSort={setAccountSort} />
                    <SortableTh label="Timezone" sortKey="timezone" sort={accountSort} onSort={setAccountSort} />
                    <SortableTh label="Status" sortKey="status" sort={accountSort} onSort={setAccountSort} />
                    <th className="px-4 py-3 text-right font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!sortedAccounts.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No WhatsApp accounts match these filters.</td></tr>
                  )}
                  {accountsPage.pageItems.map((account) => (
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
            <PaginationControls {...accountsPage} onPageChange={accountsPage.setPage} onPageSizeChange={accountsPage.setPageSize} />
          </>
        )}
        </Card>
      )}

      {activeTab === 'ledger' && (
        <Card id="ledger-panel" role="tabpanel" aria-labelledby="ledger-tab" className="overflow-hidden p-0">
          <div className="border-b border-border/80 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-primary" />
                <h3 className="text-sm font-semibold">Wallet Ledger</h3>
                <span className="text-xs text-muted-foreground">{walletLedger.total} entries</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadWalletFile('csv')} disabled={!!downloadingWallet}>
                  <Download size={13} /> {downloadingWallet === 'csv' ? 'Exporting...' : 'CSV'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadWalletFile('pdf')} disabled={!!downloadingWallet}>
                  <Download size={13} /> {downloadingWallet === 'pdf' ? 'Exporting...' : 'PDF'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadWalletFile('statement')} disabled={!!downloadingWallet}>
                  <Download size={13} /> {downloadingWallet === 'statement' ? 'Downloading...' : 'Statement'}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1.2fr_1fr_auto_auto]">
              <Input
                label="Search"
                placeholder="Description, reason, reference..."
                value={walletSearch}
                onChange={(e) => setWalletSearch(e.target.value)}
              />
              <Input
                label="From"
                type="date"
                value={walletFilters.from}
                onChange={(e) => setWalletFilters({ ...walletFilters, from: e.target.value })}
              />
              <Input
                label="To"
                type="date"
                value={walletFilters.to}
                onChange={(e) => setWalletFilters({ ...walletFilters, to: e.target.value })}
              />
              <Select
                label="Type"
                value={walletFilters.type}
                onChange={(e) => setWalletFilters({ ...walletFilters, type: e.target.value })}
              >
                <option value="all">All transaction types</option>
                {WALLET_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{WALLET_TYPE_LABEL[type]}</option>)}
              </Select>
              <Select
                label="Direction"
                value={walletFilters.direction}
                onChange={(e) => setWalletFilters({ ...walletFilters, direction: e.target.value })}
              >
                <option value="all">All</option>
                <option value="credit">Credits</option>
                <option value="debit">Debits</option>
              </Select>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={clearWalletFilters}>Clear</Button>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={applyWalletFilters}>Apply</Button>
              </div>
            </div>
          </div>
          {!walletTransactions.length ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No wallet transactions recorded for this client.</p>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <SortableTh label="Transaction" sortKey="transaction" sort={walletSort} onSort={setWalletSort} />
                      <SortableTh label="Status" sortKey="status" sort={walletSort} onSort={setWalletSort} />
                      <SortableTh label="Credit" sortKey="credit" sort={walletSort} onSort={setWalletSort} align="right" />
                      <SortableTh label="Debit" sortKey="debit" sort={walletSort} onSort={setWalletSort} align="right" />
                      <SortableTh label="Balance" sortKey="balance" sort={walletSort} onSort={setWalletSort} align="right" />
                      <SortableTh label="Created" sortKey="createdAt" sort={walletSort} onSort={setWalletSort} />
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!sortedWalletTransactions.length && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No wallet transactions match these filters.</td></tr>
                    )}
                    {sortedWalletTransactions.map((txn) => {
                      const canReverse = Number(txn.debitAmount || 0) > 0 && txn.status !== 'reversed';
                      return (
                        <tr key={txn._id} className="table-row-hover">
                          <td className="px-4 py-3">
                            <p className="font-medium">{WALLET_TYPE_LABEL[txn.type] || txn.type}</p>
                            <p className="max-w-xs truncate text-xs text-muted-foreground">{txn.description || txn.reason || txn.referenceId || '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge label={txn.status || 'completed'} color={txn.status === 'reversed' ? 'yellow' : 'green'} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {txn.creditAmount ? fmtMoney(txn.creditAmount) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">
                            {txn.debitAmount ? fmtMoney(txn.debitAmount) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right">{fmtMoney(txn.balanceAfter)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(txn.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            {canReverse ? (
                              <Button variant="outline" size="sm" onClick={() => openReverse(txn)}>
                                <RotateCcw size={13} /> Refund
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={walletLedger.page}
                totalPages={walletLedger.totalPages || 1}
                pageSize={walletLimit}
                totalItems={walletLedger.total}
                startItem={walletLedger.total === 0 ? 0 : ((walletLedger.page - 1) * walletLimit) + 1}
                endItem={Math.min(walletLedger.total, walletLedger.page * walletLimit)}
                onPageChange={changeWalletPage}
                onPageSizeChange={changeWalletLimit}
              />
            </div>
          )}
        </Card>
      )}

      {activeTab === 'payments' && (
        <Card id="payments-panel" role="tabpanel" aria-labelledby="payments-tab" className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              <h3 className="text-sm font-semibold">Payment Transactions</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{payments.length} records</span>
              <Button variant="outline" size="sm" onClick={downloadBillingStatement} disabled={downloadingBillingStatement}>
                <Download size={13} /> {downloadingBillingStatement ? 'Downloading...' : 'Statement'}
              </Button>
            </div>
          </div>
          {!!payments.length && (
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_160px_190px]">
              <Input placeholder="Search order, payment, purpose..." value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} />
              <Select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="paid">Paid</option>
                <option value="created">Created</option>
                <option value="failed">Failed</option>
              </Select>
              <Select value={paymentPurposeFilter} onChange={(e) => setPaymentPurposeFilter(e.target.value)}>
                <option value="all">All purposes</option>
                {paymentPurposeOptions.map((purpose) => <option key={purpose} value={purpose}>{purpose.replace('_', ' ')}</option>)}
              </Select>
            </div>
          )}
          {!payments.length ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No payment transactions recorded for this client.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <SortableTh label="Payment" sortKey="payment" sort={paymentSort} onSort={setPaymentSort} />
                    <SortableTh label="Purpose" sortKey="purpose" sort={paymentSort} onSort={setPaymentSort} />
                    <SortableTh label="Amount" sortKey="amount" sort={paymentSort} onSort={setPaymentSort} align="right" />
                    <SortableTh label="Status" sortKey="status" sort={paymentSort} onSort={setPaymentSort} />
                    <SortableTh label="Created" sortKey="createdAt" sort={paymentSort} onSort={setPaymentSort} />
                    <th className="px-4 py-3 text-right font-semibold">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!sortedPayments.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No payment transactions match these filters.</td></tr>
                  )}
                  {paymentsPage.pageItems.map((payment) => (
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
          {!!payments.length && (
            <PaginationControls {...paymentsPage} onPageChange={paymentsPage.setPage} onPageSizeChange={paymentsPage.setPageSize} />
          )}
        </Card>
      )}

      {activeTab === 'history' && (
        <Card id="history-panel" role="tabpanel" aria-labelledby="history-tab" className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Subscription History</h3>
          </div>
          <span className="text-xs text-muted-foreground">{subscriptionHistory.length} subscriptions</span>
        </div>
        {!!subscriptionHistory.length && (
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px]">
            <Input placeholder="Search plan, billing, status, reason..." value={subscriptionSearch} onChange={(e) => setSubscriptionSearch(e.target.value)} />
            <Select value={subscriptionStatusFilter} onChange={(e) => setSubscriptionStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        )}
        {!subscriptionHistory.length ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No subscription history recorded for this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Plan" sortKey="plan" sort={subscriptionSort} onSort={setSubscriptionSort} />
                  <SortableTh label="Period" sortKey="period" sort={subscriptionSort} onSort={setSubscriptionSort} />
                  <SortableTh label="Billing" sortKey="billing" sort={subscriptionSort} onSort={setSubscriptionSort} />
                  <SortableTh label="Price" sortKey="price" sort={subscriptionSort} onSort={setSubscriptionSort} align="right" />
                  <SortableTh label="Status" sortKey="status" sort={subscriptionSort} onSort={setSubscriptionSort} />
                  <SortableTh label="Reason" sortKey="reason" sort={subscriptionSort} onSort={setSubscriptionSort} />
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!sortedSubscriptionHistory.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No subscriptions match these filters.</td></tr>
                )}
                {subscriptionHistoryPage.pageItems.map((item) => {
                  const status = displaySubscriptionStatus(item);
                  const canModify = canModifySubscription(item);
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
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={downloadingSubscriptionId === item._id}
                            onClick={() => downloadSubscriptionInvoice(item)}
                          >
                            <Download size={13} /> {downloadingSubscriptionId === item._id ? 'Downloading...' : 'Invoice'}
                          </Button>
                          {canModify ? (
                            <>
                            <Button variant="outline" size="sm" onClick={() => openExtendSubscription(item)}>Extend</Button>
                            <Button variant="outline" size="sm" onClick={() => openCancelSubscription('cancel', item)}>Cancel</Button>
                            {role === 'admin' && (
                              <Button variant="outline" size="sm" onClick={() => openCancelSubscription('revoke', item)}>Revoke</Button>
                            )}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!!subscriptionHistory.length && (
          <PaginationControls {...subscriptionHistoryPage} onPageChange={subscriptionHistoryPage.setPage} onPageSizeChange={subscriptionHistoryPage.setPageSize} />
        )}
        </Card>
      )}

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

      <Modal open={!!reverseTarget} onClose={() => setReverseTarget(null)} title="Refund or reverse transaction"
        footer={
          <>
            <Button variant="outline" onClick={() => setReverseTarget(null)} disabled={reversingTxn}>Cancel</Button>
            <Button onClick={submitReverse} disabled={reversingTxn || !reverseTarget}>
              {reversingTxn ? 'Saving...' : reverseForm.action === 'refund' ? 'Refund transaction' : 'Reverse transaction'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{WALLET_TYPE_LABEL[reverseTarget?.type] || reverseTarget?.type || 'Transaction'}</p>
            <p className="text-xs text-muted-foreground">
              Debit {fmtMoney(reverseTarget?.debitAmount)} - Balance after {fmtMoney(reverseTarget?.balanceAfter)}
            </p>
          </div>
          <Select
            label="Action"
            value={reverseForm.action}
            onChange={(e) => setReverseForm({ ...reverseForm, action: e.target.value })}
          >
            <option value="refund">Refund</option>
            <option value="reversal">Reversal</option>
          </Select>
          <Input
            label="Reason"
            value={reverseForm.reason}
            onChange={(e) => setReverseForm({ ...reverseForm, reason: e.target.value })}
          />
          {reverseError && <p className="text-sm text-red-500">{reverseError}</p>}
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

      <Modal open={editUserOpen} onClose={() => setEditUserOpen(false)} title="Edit client login"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditUserOpen(false)} disabled={savingUser}>Cancel</Button>
            <Button onClick={submitEditUser} disabled={savingUser || !editUserTarget}>
              {savingUser ? 'Saving...' : 'Save login'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Name"
            value={editUserForm.name}
            onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={editUserForm.email}
            onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
          />
          <Select
            label="Role"
            value={editUserForm.role}
            onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
          >
            <option value="client_owner">Owner</option>
            <option value="client_user">User</option>
          </Select>
          <Select
            label="Status"
            value={editUserForm.isActive ? 'active' : 'inactive'}
            onChange={(e) => setEditUserForm({ ...editUserForm, isActive: e.target.value === 'active' })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          {editUserError && <p className="text-sm text-red-500">{editUserError}</p>}
        </div>
      </Modal>

      <Modal open={!!deleteUserTarget} onClose={() => setDeleteUserTarget(null)} title="Delete client login"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)} disabled={deletingUser}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeleteUser} disabled={deletingUser}>
              {deletingUser ? 'Deleting...' : 'Delete login'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Delete <strong>{deleteUserTarget?.name || 'this login'}</strong> ({deleteUserTarget?.email})? This user will immediately lose access.
        </p>
      </Modal>

      <Modal open={deleteClientOpen} onClose={() => setDeleteClientOpen(false)} title="Delete client"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteClientOpen(false)} disabled={deletingClient}>Cancel</Button>
            <Button variant="danger" onClick={confirmDeleteClient} disabled={deletingClient}>
              {deletingClient ? 'Deleting...' : 'Delete client'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Delete <strong>{tenant?.name}</strong>? This disables the client login and workspace while preserving billing and message history.
          </p>
          {deleteClientError && <p className="text-sm text-red-500">{deleteClientError}</p>}
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
            label="Business ID"
            value={manualAccountForm.businessId}
            onChange={(e) => setManualAccountForm({ ...manualAccountForm, businessId: e.target.value })}
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
