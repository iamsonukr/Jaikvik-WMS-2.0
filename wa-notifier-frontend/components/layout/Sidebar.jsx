'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCircle, FileText, Megaphone,
  Inbox, Bot, BarChart2, Settings, MessageCircle, LogOut, ChevronDown, X, Check,
  Wallet, CreditCard, Building2, Tags, ScrollText, UsersRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useClient } from '@/hooks/useClient';
import { normalizeRole } from '@/lib/roles';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui';

// Messaging Tools — the original operational dashboard (send campaigns,
// manage contacts/templates, shared inbox). Lives under /master/*.
// Admin (supreme) and Master (runs campaigns for any client) both get this.
const messagingNav = [
  { href: '/master/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/master/broadcasts',  label: 'Broadcasts',  icon: Megaphone },
  { href: '/master/inbox',       label: 'Inbox',       icon: Inbox },
  { href: '/master/contacts',    label: 'Contacts',    icon: UserCircle },
  { href: '/master/templates',   label: 'Templates',   icon: FileText },
  { href: '/master/chatbot',     label: 'Chatbot',     icon: Bot },
  { href: '/master/analytics',   label: 'Analytics',   icon: BarChart2 },
  { href: '/master/clients',     label: 'WhatsApp Accounts', icon: Users },
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
  { href: '/admin/plans',       label: 'Plans',          icon: Tags },
  { href: '/admin/wallets',     label: 'Wallets',        icon: Wallet },
  { href: '/admin/payments',    label: 'Payments',       icon: CreditCard },
  { href: '/admin/staff',       label: 'Staff & Roles',  icon: UsersRound, adminOnly: true },
  { href: '/admin/audit-logs',  label: 'Audit Logs',     icon: ScrollText },
  { href: '/admin/settings',    label: 'Settings',       icon: Settings },
];

// Client (tenant) dashboard — same messaging tools, scoped to their own
// tenant automatically by the backend, plus billing/team screens that only
// make sense from a tenant's own point of view.
const clientNav = [
  { href: '/client/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/client/broadcasts',  label: 'Broadcasts',  icon: Megaphone },
  { href: '/client/inbox',       label: 'Inbox',       icon: Inbox },
  { href: '/client/contacts',    label: 'Contacts',    icon: UserCircle },
  { href: '/client/templates',   label: 'Templates',   icon: FileText },
  { href: '/client/chatbot',     label: 'Chatbot',     icon: Bot },
  { href: '/client/analytics',   label: 'Analytics',   icon: BarChart2 },
  { href: '/client/connect-whatsapp', label: 'WhatsApp Setup', icon: MessageCircle, ownerOnly: true },
  { href: '/client/plans',      label: 'Plans',       icon: CreditCard },
  { href: '/client/wallet',      label: 'Wallet',      icon: Wallet },
  { href: '/client/settings',    label: 'Settings',    icon: Settings },
];

const ROLE_LABEL = { admin: 'Admin', master: 'Master', client_owner: 'Client', client_user: 'Client' };

function NavGroup({ title, items, pathname, onClose }) {
  return (
    <div className="mb-4">
      {title && <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--menu-text)]/70">{title}</p>}
      <div className="space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href}
              onClick={onClose}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                ${active ? 'bg-brand-gradient text-white shadow-lg shadow-brand/20' : 'text-[var(--menu-text)] hover:bg-white/[0.07] hover:text-[var(--menu-text)]'}`}>
              <Icon size={17} className={active ? '' : 'transition-transform duration-150 group-hover:scale-110'} />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ open = false, onClose = () => {} }) {
  const pathname               = usePathname();
  const { user, logout }       = useAuth();
  const { clients, activeClient, selectClient } = useClient();
  const [clientOpen, setClientOpen] = useState(false);

  const role = normalizeRole(user?.role);
  const isAdmin = role === 'admin';
  const isMaster = role === 'master';
  const isClient = role === 'client_owner' || role === 'client_user';

  // Admin (supreme) sees everything. Master sees the same, minus the
  // handful of admin-exclusive control-panel actions. Client sees only its
  // own scoped nav.
  const controlPanelForRole = isAdmin ? controlPanelNav : controlPanelNav.filter((i) => !i.adminOnly);
  const clientNavForRole = clientNav.filter((item) => {
    if (item.ownerOnly && role !== 'client_owner') return false;
    return true;
  });

  // Platform users switch across all accounts; tenant users switch across
  // their own WhatsApp numbers when their plan allows more than one.
  const showClientSwitcher = ((isAdmin || isMaster) && clients.length > 0) || (isClient && clients.length > 1);
  const showClientCompany = isClient && activeClient && !showClientSwitcher;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-[#07111f] text-slate-300 shadow-2xl transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
        <div className="relative w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-brand-gradient shadow-lg shadow-brand/25">
          <MessageCircle size={18} color="#fff" strokeWidth={2.25} />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#07111f]" />
        </div>
        <div className="min-w-0">
          <span className="block font-bold text-white text-base tracking-tight">Jaikvik WMS</span>
          <span className="block text-[11px] text-slate-500">{ROLE_LABEL[role] || 'Business messaging'}</span>
        </div>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X size={16} />
        </button>
      </div>

      {/* WhatsApp account switcher */}
      {showClientSwitcher && (
        <div className="px-3 py-3 border-b border-white/10 relative">
          <button
            onClick={() => setClientOpen(p => !p)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm bg-white/[0.04] hover:bg-white/10 transition-colors border border-white/5"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-gradient text-[10px] font-bold text-white">
                {activeClient?.name?.[0]?.toUpperCase() || '?'}
              </span>
              <span className="truncate font-medium text-white">
                {activeClient?.name || 'Select account'}
              </span>
            </span>
            <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${clientOpen ? 'rotate-180' : ''}`} />
          </button>
          {clientOpen && (
            <div className="absolute left-3 right-3 top-full mt-1.5 z-10 rounded-lg overflow-hidden border border-white/10 bg-[#0b1524] shadow-2xl animate-fade-in max-h-64 overflow-y-auto">
              {clients.map(c => (
                <button key={c._id}
                  onClick={() => { selectClient(c); setClientOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 text-sm transition-colors
                    ${activeClient?._id === c._id ? 'bg-brand-gradient text-white' : 'hover:bg-white/10 text-slate-300'}`}>
                  <span className="truncate">{c.name}</span>
                  {activeClient?._id === c._id && <Check size={14} className="shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showClientCompany && (
        <div className="px-3 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/[0.04] border border-white/5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-gradient text-[10px] font-bold text-white">
              {activeClient.name?.[0]?.toUpperCase() || '?'}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-white">{activeClient.name}</span>
              <span className="block truncate text-[11px] text-slate-500">WhatsApp workspace</span>
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {isClient && <NavGroup items={clientNavForRole} pathname={pathname} onClose={onClose} />}
        {(isAdmin || isMaster) && (
          <>
            <NavGroup title="Control panel" items={controlPanelForRole} pathname={pathname} onClose={onClose} />
            {/* Temporarily hidden from admin panel sidebar: Messaging tools */}
            {/* <NavGroup title="Messaging tools" items={messagingNav} pathname={pathname} onClose={onClose} /> */}
          </>
        )}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
          <Avatar className="h-8 w-8 ring-2 ring-white/10">
            <AvatarFallback className="text-[11px]">{user?.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="text-slate-400 hover:text-white transition-colors" aria-label="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
