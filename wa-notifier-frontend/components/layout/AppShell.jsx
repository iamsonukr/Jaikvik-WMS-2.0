'use client';
import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { Menu, MessageCircle, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { roleHomePath } from '@/hooks/useBasePath';
import { normalizeRole } from '@/lib/roles';

// allowedRoles: optional array of roles permitted on this page. Every page
// in /master, /client, /admin passes this so a signed-in user of the wrong
// role gets redirected to THEIR OWN dashboard rather than seeing a
// different area's UI (or worse, its data) just by typing the URL.
export default function AppShell({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const role = normalizeRole(user?.role);
  const isAdminOperations = role === 'admin' && [
    '/admin/broadcasts',
    '/admin/inbox',
    '/admin/contacts',
    '/admin/templates',
    '/admin/chatbot',
    '/admin/analytics',
  ].some((prefix) => pathname === prefix || pathname?.startsWith(prefix + '/'));
  const sectionLabel = role === 'admin'
    ? isAdminOperations ? 'Operations' : 'Control panel'
    : role === 'master'
      ? 'Messaging workspace'
      : 'Client workspace';

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    const normalizedRole = normalizeRole(user.role);
    if (allowedRoles && !allowedRoles.includes(normalizedRole)) {
      router.replace(roleHomePath(normalizedRole));
    }
  }, [user, loading, allowedRoles, router]);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('wa_sidebar_collapsed') : null;
    setSidebarCollapsed(stored === 'true');
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem('wa_sidebar_collapsed', String(next));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading workspace…</p>
      </div>
    );
  }
  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(role)) return null; // redirecting

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm lg:hidden"
        />
      )}

      <header className={`sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 px-4 backdrop-blur-xl transition-[margin] duration-200 lg:px-6 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`} style={{ background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent lg:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-sm">
              <MessageCircle size={18} />
            </div>
            <span className="font-semibold tracking-tight">Jaikvik WMS</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold tracking-tight">{sectionLabel}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
            {role || 'user'}
          </span>
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground shadow-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="hidden text-xs font-medium sm:inline">{theme === 'dark' ? 'Day' : 'Night'}</span>
          </button>
        </div>
      </header>

      <main className={`transition-[margin] duration-200 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-5 lg:p-6 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
