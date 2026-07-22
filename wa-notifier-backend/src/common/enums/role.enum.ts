// Platform-wide roles.
//
// ADMIN        — the supreme role: platform owner, full access to everything
//                including staff management, tenant suspension, plan
//                deletion, and subscription revocation. No tenantId.
// MASTER       — day-to-day platform staff: runs campaigns/messaging for any
//                onboarded client and manages tenants/plans/pricing/wallets,
//                but without ADMIN's exclusive supreme actions. No tenantId.
// CLIENT_OWNER — owner of a tenant (paying customer account), scoped to their tenantId.
// CLIENT_USER  — team member invited into a tenant, scoped to their tenantId.
export enum UserRole {
  ADMIN = 'admin',
  MASTER = 'master',
  CLIENT_OWNER = 'client_owner',
  CLIENT_USER = 'client_user',
}

export const TENANT_SCOPED_ROLES = [UserRole.CLIENT_OWNER, UserRole.CLIENT_USER];
export const PLATFORM_ROLES = [UserRole.ADMIN, UserRole.MASTER];

const LEGACY_ROLE_ALIASES: Record<string, UserRole> = {
  master_admin: UserRole.ADMIN,
};

export function normalizeUserRole(role: unknown): UserRole | unknown {
  if (typeof role !== 'string') return role;
  return LEGACY_ROLE_ALIASES[role] || role;
}
