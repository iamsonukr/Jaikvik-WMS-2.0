'use client';
import { useAuth } from '@/lib/auth-context';
import { normalizeRole } from '@/lib/roles';

// Single source of truth for which URL prefix each role's dashboard lives
// under. Keeping this in one place means adding/renaming a role-area later
// only touches this file, not every page that links to "the dashboard".
// Single source of truth for each role's default "home" area. Admin (the
// supreme role) lands on the control panel; Master (runs campaigns for any
// client) lands on the messaging dashboard; both can navigate into the
// other's area too (see Sidebar.jsx) — this only decides where they land
// right after login.
const ROLE_BASE_PATHS = {
  admin: '/admin',
  master: '/master',
  client_owner: '/client',
  client_user: '/client',
};

export function basePathForRole(role) {
  return ROLE_BASE_PATHS[normalizeRole(role)] || '/client';
}

export function roleHomePath(role) {
  return `${basePathForRole(role)}/dashboard`;
}

// Convenience hook for components that already have access to the logged-in
// user via useAuth() and just need their own area's prefix.
export function useBasePath() {
  const { user } = useAuth();
  return basePathForRole(user?.role);
}
