'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, UserCircle, FileText, Megaphone,
  Inbox, Bot, BarChart2, Settings, MessageCircle, LogOut, X,
  Wallet, CreditCard, Building2, Tags, ScrollText, UsersRound, Users, Receipt, Bell, LifeBuoy,
  ChevronsLeft, ChevronsRight, Landmark,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useClient } from '@/hooks/useClient';
import { normalizeRole } from '@/lib/roles';
import { Avatar, AvatarFallback, SearchableSelect } from '@/components/ui';
import api from '@/lib/api';

// Messaging Tools — the original operational dashboard (send campaigns,
// manage contacts/templates, shared inbox). Lives under /master/*.
// Admin (supreme) and Master (runs campaigns for any client) both get this.
const masterCompanyNav = [
  { href: '/master/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/master/alerts',      label: 'Notifications', icon: Bell },
  { href: '/master/broadcasts',  label: 'Broadcasts',  icon: Megaphone },
  { href: '/master/inbox',       label: 'Inbox',       icon: Inbox },
  { href: '/master/contacts',    label: 'Contacts',    icon: UserCircle },
  { href: '/master/templates',   label: 'Templates',   icon: FileText },
  { href: '/master/chatbot',     label: 'Chatbot',     icon: Bot },
  { href: '/master/analytics',   label: 'Analytics',   icon: BarChart2 },
];

const masterGlobalNav = [
  { href: '/master/connect-whatsapp', label: 'WhatsApp Setup', icon: MessageCircle },
  { href: '/master/plans',       label: 'Plans',       icon: CreditCard },
  { href: '/master/wallet',      label: 'Wallet',      icon: Wallet },
  { href: '/master/tickets',     label: 'Support & Tickets', icon: LifeBuoy },
  { href: '/master/settings',    label: 'Settings',    icon: Settings },
];

// Control Panel — platform/billing management. Lives under /admin/*.
// 'adminOnly: true' items are exclusive to the supreme Admin role and are
// filtered out of Master's nav (Master still can't reach them even by URL —
// the page itself is gated with allowedRoles={['admin']}, this is just so
// the link isn't shown to a role that would be redirected away from it).
const controlPanelNav = [
  { href: '/admin/dashboard',   label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/admin/tenants',     label: 'Clients',        icon: Building2 },
  { href: '/admin/whatsapp-accounts', label: 'WhatsApp Accounts', icon: MessageCircle },
  { href: '/admin/plans',       label: 'Plans',          icon: Tags },
  { href: '/admin/wallets',     label: 'Wallets',        icon: Wallet },
  { href: '/admin/payments',    label: 'Payments',       icon: CreditCard },
  { href: '/admin/expenses',    label: 'Expenses',       icon: Landmark },
  { href: '/admin/staff',       label: 'Staff & Roles',  icon: UsersRound, adminOnly: true },
  { href: '/admin/audit-logs',  label: 'Audit Logs',     icon: ScrollText },
  { href: '/admin/tickets',     label: 'Support & Tickets', icon: LifeBuoy },
  { href: '/admin/settings',    label: 'Settings',       icon: Settings },
];

const adminOperationsNav = [
  { href: '/admin/broadcasts',  label: 'Broadcasts', icon: Megaphone },
  { href: '/admin/inbox',       label: 'Inbox',      icon: Inbox },
  { href: '/admin/contacts',    label: 'Contacts',   icon: UserCircle },
  { href: '/admin/templates',   label: 'Templates',  icon: FileText },
  { href: '/admin/chatbot',     label: 'Chatbot',    icon: Bot },
  { href: '/admin/analytics',   label: 'Analytics',  icon: BarChart2 },
];

// Client (tenant) dashboard — same messaging tools, scoped to their own
// tenant automatically by the backend, plus billing/team screens that only
// make sense from a tenant's own point of view.
const clientNav = [
  { href: '/client/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/client/alerts',      label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
  { href: '/client/broadcasts',  label: 'Broadcasts',  icon: Megaphone, badgeKey: 'broadcasts' },
  { href: '/client/inbox',       label: 'Inbox',       icon: Inbox, badgeKey: 'inbox' },
  { href: '/client/contacts',    label: 'Contacts',    icon: UserCircle, badgeKey: 'contacts' },
  { href: '/client/templates',   label: 'Templates',   icon: FileText, badgeKey: 'templates' },
  { href: '/client/chatbot',     label: 'Chatbot',     icon: Bot, badgeKey: 'chatbot' },
  { href: '/client/analytics',   label: 'Analytics',   icon: BarChart2 },
  { href: '/client/connect-whatsapp', label: 'WhatsApp Setup', icon: MessageCircle, ownerOnly: true, badgeKey: 'whatsapp' },
  { href: '/client/team',        label: 'Team',        icon: Users, badgeKey: 'team' },
  { href: '/client/plans',      label: 'Plans',       icon: CreditCard, badgeKey: 'plans' },
  { href: '/client/wallet',      label: 'Wallet',      icon: Wallet, badgeKey: 'wallet' },
  { href: '/client/payments',    label: 'Payments',    icon: Receipt, badgeKey: 'payments' },
  { href: '/client/tickets',     label: 'Support & Tickets', icon: LifeBuoy, badgeKey: 'tickets' },
  { href: '/client/settings',    label: 'Settings',    icon: Settings },
];

const ROLE_LABEL = { admin: 'Admin', master: 'Master', client_owner: 'Client', client_user: 'Client' };

function formatBadgeValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (value >= 100000) return `${Math.round(value / 100000)}L`;
    if (value >= 1000) return `${Math.round(value / 1000)}k`;
    return String(value);
  }
  return String(value);
}

function formatWalletBadge(value) {
  if (value === null || value === undefined) return '';
  const amount = Number(value || 0);
  if (amount >= 100000) return `Rs ${Math.round(amount / 100000)}L`;
  if (amount >= 1000) return `Rs ${Math.round(amount / 1000)}k`;
  return `Rs ${Math.round(amount)}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function daysUntil(value) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.ceil(diff / 86400000);
}

function NavBadge({ value, collapsed = false, tone = 'neutral' }) {
  const label = formatBadgeValue(value);
  if (!label) return null;
  const toneClass = tone === 'danger'
    ? 'bg-red-500 text-white'
    : tone === 'warning'
      ? 'bg-amber-400 text-slate-950'
      : 'bg-white/12 text-white ring-1 ring-white/10';
  return (
    <span
      className={`${toneClass} ${collapsed
        ? 'absolute right-1.5 top-1.5 min-w-4 rounded-full px-1 text-center text-[9px] leading-4'
        : 'ml-auto max-w-[72px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4'}`}
    >
      {label}
    </span>
  );
}

function NavGroup({ title, items, pathname, onClose, collapsed = false, badges = {}, bordered = false }) {
  return (
    <div className={`mb-4 ${bordered ? 'rounded-xl border border-white/10 bg-white/[0.025] p-2 shadow-sm shadow-black/10' : ''}`}>
      {title && !collapsed && <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--menu-text)]/70">{title}</p>}
      <div className="space-y-0.5">
        {items.map(({ href, label, icon: Icon, badgeKey }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          const badge = badgeKey ? badges[badgeKey] : null;
          return (
            <Link key={href} href={href}
              onClick={onClose}
              title={collapsed ? `${label}${badge?.label ? `: ${badge.label}` : ''}` : undefined}
              className={`group relative flex items-center rounded-lg text-sm font-medium transition-all duration-150
                ${collapsed ? 'h-11 justify-center px-0' : 'gap-3 px-3 py-2.5'}
                ${active ? 'bg-brand-gradient text-white shadow-lg shadow-brand/20' : 'text-[var(--menu-text)] hover:bg-white/[0.07] hover:text-[var(--menu-text)]'}`}>
              <Icon size={17} className={active ? '' : 'transition-transform duration-150 group-hover:scale-110'} />
              <span className={collapsed ? 'sr-only' : ''}>{label}</span>
              {badge ? <NavBadge value={badge.value} tone={badge.tone} collapsed={collapsed} /> : active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ open = false, onClose = () => {}, collapsed = false, onToggleCollapsed = () => {} }) {
  const pathname               = usePathname();
  const { user, logout }       = useAuth();
  const { clients, activeClient, selectClient } = useClient();
  const [clientBadges, setClientBadges] = useState({});

  const role = normalizeRole(user?.role);
  const isAdmin = role === 'admin';
  const isMaster = role === 'master';
  const isClient = role === 'client_owner' || role === 'client_user';

  // Admin sees platform controls. Master sees the client-style operating
  // workspace and uses the account switcher above to work across clients.
  const controlPanelForRole = controlPanelNav;
  const clientNavForRole = clientNav.filter((item) => {
    if (item.ownerOnly && role !== 'client_owner') return false;
    return true;
  });

  // Platform users switch across all accounts; tenant users switch across
  // their own WhatsApp numbers when their plan allows more than one.
  const showClientSwitcher = ((isAdmin || isMaster) && clients.length > 0) || (isClient && clients.length > 1);
  const showClientCompany = isClient && activeClient && !showClientSwitcher;

  useEffect(() => {
    if (!isClient || !activeClient?._id) {
      setClientBadges({});
      return undefined;
    }

    let cancelled = false;
    const loadClientBadges = async () => {
      const accountId = activeClient._id;
      const [
        alertsRes,
        threadsRes,
        walletRes,
        contactsRes,
        broadcastsRes,
        templatesRes,
        chatbotRes,
        teamRes,
        paymentsRes,
        ticketsRes,
        subscriptionRes,
      ] = await Promise.all([
        api.get(`/alerts?whatsappAccountId=${accountId}`).catch(() => ({ data: [] })),
        api.get(`/inbox/threads?whatsappAccountId=${accountId}`).catch(() => ({ data: [] })),
        api.get('/wallet/me').catch(() => ({ data: null })),
        api.get(`/contacts/count?whatsappAccountId=${accountId}`).catch(() => ({ data: null })),
        api.get(`/broadcasts?whatsappAccountId=${accountId}`).catch(() => ({ data: [] })),
        api.get(`/templates?whatsappAccountId=${accountId}`).catch(() => ({ data: [] })),
        api.get(`/chatbot?whatsappAccountId=${accountId}`).catch(() => ({ data: [] })),
        api.get('/auth/team').catch(() => ({ data: [] })),
        api.get('/payments/me').catch(() => ({ data: [] })),
        api.get('/tickets').catch(() => ({ data: [] })),
        api.get('/subscriptions/me').catch(() => ({ data: null })),
      ]);
      if (cancelled) return;

      const alerts = asArray(alertsRes.data);
      const threads = asArray(threadsRes.data);
      const broadcasts = asArray(broadcastsRes.data);
      const templates = asArray(templatesRes.data);
      const chatbotRules = asArray(chatbotRes.data);
      const team = asArray(teamRes.data);
      const payments = asArray(paymentsRes.data);
      const tickets = asArray(ticketsRes.data);
      const activeThreads = threads.filter((thread) => String(thread.threadStatus || 'open').toLowerCase() !== 'resolved');
      const balance = walletRes.data?.balance;
      const contactsCount = Number(contactsRes.data?.count || 0);
      const activeBroadcasts = broadcasts.filter((broadcast) => !['done', 'canceled'].includes(String(broadcast.status || '').toLowerCase()));
      const approvedTemplates = templates.filter((template) => String(template.status || '').toUpperCase() === 'APPROVED');
      const activeRules = chatbotRules.filter((rule) => rule.isActive !== false);
      const activeTeam = team.filter((member) => member.isActive !== false);
      const openTickets = tickets.filter((ticket) => !['resolved', 'closed'].includes(String(ticket.status || '').toLowerCase()));
      const subscription = subscriptionRes.data;
      const planDays = daysUntil(subscription?.endDate);
      const planBadge = subscription?.planId?.name
        || subscription?.planName
        || (planDays !== null ? `${Math.max(planDays, 0)}d` : null);

      setClientBadges({
        notifications: { value: alerts.length, label: `${alerts.length} notifications`, tone: alerts.some((alert) => alert.severity === 'critical') ? 'danger' : alerts.length ? 'warning' : 'neutral' },
        broadcasts: { value: activeBroadcasts.length, label: `${activeBroadcasts.length} active campaigns`, tone: activeBroadcasts.some((broadcast) => String(broadcast.status || '').toLowerCase() === 'failed') ? 'danger' : 'neutral' },
        inbox: { value: activeThreads.length, label: `${activeThreads.length} open conversations`, tone: 'neutral' },
        contacts: { value: contactsCount, label: `${contactsCount} contacts`, tone: 'neutral' },
        templates: { value: approvedTemplates.length, label: `${approvedTemplates.length} approved templates`, tone: approvedTemplates.length ? 'neutral' : 'warning' },
        chatbot: { value: activeRules.length, label: `${activeRules.length} active rules`, tone: 'neutral' },
        whatsapp: { value: clients.length, label: `${clients.length} WhatsApp accounts`, tone: clients.length ? 'neutral' : 'warning' },
        team: { value: activeTeam.length, label: `${activeTeam.length} active team members`, tone: 'neutral' },
        plans: planBadge ? { value: planBadge, label: subscription?.endDate ? `${planBadge} plan` : 'Current plan', tone: planDays !== null && planDays <= 7 ? 'warning' : 'neutral' } : null,
        wallet: balance !== undefined && balance !== null ? { value: formatWalletBadge(balance), label: formatWalletBadge(balance), tone: Number(balance || 0) <= 0 ? 'danger' : Number(balance || 0) < 500 ? 'warning' : 'neutral' } : null,
        payments: { value: payments.length, label: `${payments.length} payments`, tone: 'neutral' },
        tickets: { value: openTickets.length, label: `${openTickets.length} open tickets`, tone: openTickets.length ? 'warning' : 'neutral' },
      });
    };

    loadClientBadges();
    const interval = setInterval(loadClientBadges, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isClient, activeClient?._id, clients.length]);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-[#07111f] text-slate-300 shadow-2xl transition-[width,transform] duration-200 lg:translate-x-0 ${collapsed ? 'lg:w-20' : 'lg:w-64'} ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-white/10 py-5 ${collapsed ? 'justify-center px-3 lg:px-3' : 'gap-2.5 px-5'}`}>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient shadow-lg shadow-brand/25">
          <MessageCircle size={18} color="#fff" strokeWidth={2.25} />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#07111f]" />
        </div>
        <div className={`min-w-0 ${collapsed ? 'hidden' : ''}`}>
          <span className="block font-bold text-white text-base tracking-tight">Jaikvik WMS</span>
          <span className="block text-[11px] text-slate-500">{ROLE_LABEL[role] || 'Business messaging'}</span>
        </div>
        <button
          type="button"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={`${collapsed ? 'absolute -right-3 top-6 rounded-full border border-white/10 bg-[#0b1524] shadow-lg' : 'ml-auto rounded-lg'} hidden h-8 w-8 items-center justify-center text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex`}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className={`${collapsed ? 'absolute right-2 top-5' : 'ml-auto'} inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:hidden`}
        >
          <X size={16} />
        </button>
      </div>

      {/* WhatsApp account switcher */}
      {showClientSwitcher && (
        <div className="px-3 py-3 border-b border-white/10">
          <SearchableSelect
            variant="sidebar"
            value={activeClient?._id || ''}
            placeholder="Select account"
            searchPlaceholder="Search accounts..."
            emptyText="No matching accounts"
            className={collapsed ? 'lg:w-14' : ''}
            menuClassName={collapsed ? 'lg:left-0 lg:w-64 lg:right-auto' : ''}
            options={clients.map((client) => ({
              value: client._id,
              label: client.name || client.phone || client._id,
              description: client.phone || client.phoneNumberId,
              searchText: `${client.name || ''} ${client.phone || ''} ${client.phoneNumberId || ''} ${client.wabaId || ''}`,
              client,
            }))}
            onChange={(_, option) => selectClient(option.client)}
            renderValue={(option) => (
              <span className={`flex min-w-0 items-center gap-2 ${collapsed ? 'lg:justify-center' : ''}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-gradient text-[10px] font-bold text-white">
                  {option.label?.[0]?.toUpperCase() || '?'}
                </span>
                <span className={`truncate font-medium text-white ${collapsed ? 'lg:hidden' : ''}`}>{option.label}</span>
              </span>
            )}
          />
        </div>
      )}

      {showClientCompany && (
        <div className="px-3 py-3 border-b border-white/10">
          <div className={`flex items-center rounded-lg border border-white/5 bg-white/[0.04] py-2 text-sm ${collapsed ? 'justify-center px-0' : 'gap-2 px-3'}`} title={collapsed ? activeClient.name : undefined}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-gradient text-[10px] font-bold text-white">
              {activeClient.name?.[0]?.toUpperCase() || '?'}
            </span>
            <span className={`min-w-0 ${collapsed ? 'hidden' : ''}`}>
              <span className="block truncate font-medium text-white">{activeClient.name}</span>
              <span className="block truncate text-[11px] text-slate-500">WhatsApp workspace</span>
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {isClient && <NavGroup items={clientNavForRole} pathname={pathname} onClose={onClose} collapsed={collapsed} badges={clientBadges} />}
        {isMaster && (
          <>
            <NavGroup
              title="Company Workspace"
              items={masterCompanyNav}
              pathname={pathname}
              onClose={onClose}
              collapsed={collapsed}
              bordered
            />
            <NavGroup
              title="Global Management"
              items={masterGlobalNav}
              pathname={pathname}
              onClose={onClose}
              collapsed={collapsed}
              bordered
            />
          </>
        )}
        {isAdmin && <NavGroup title="Control panel" items={controlPanelForRole} pathname={pathname} onClose={onClose} collapsed={collapsed} />}
        {isAdmin && <NavGroup title="Operations" items={adminOperationsNav} pathname={pathname} onClose={onClose} collapsed={collapsed} />}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className={`flex items-center rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04] ${collapsed ? 'justify-center gap-0 lg:px-0' : 'gap-3'}`}>
          <Avatar className="h-8 w-8 ring-2 ring-white/10">
            <AvatarFallback className="text-[11px]">{user?.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className={`flex-1 min-w-0 ${collapsed ? 'hidden' : ''}`}>
            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className={`text-slate-400 transition-colors hover:text-white ${collapsed ? 'hidden' : ''}`} aria-label="Log out">
            <LogOut size={16} />
          </button>
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="mt-2 hidden h-9 w-full items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
