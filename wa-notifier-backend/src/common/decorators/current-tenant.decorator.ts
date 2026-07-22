import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Returns the tenantId embedded in the caller's JWT (null for admin/master,
// since platform staff aren't scoped to a tenant). Tenant-owned controllers should
// use this rather than trusting a tenantId passed in the request body/query —
// the actual query-level enforcement (rejecting cross-tenant reads/writes) is
// wired up module-by-module as each tenant-owned feature is built in the next phase.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user?.tenantId ?? null,
);
