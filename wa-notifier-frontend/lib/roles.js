const ROLE_ALIASES = {
  master_admin: 'admin',
};

export function normalizeRole(role) {
  return ROLE_ALIASES[role] || role;
}
