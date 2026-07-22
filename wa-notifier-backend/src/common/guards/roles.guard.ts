import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole, normalizeUserRole } from '../enums/role.enum';

// Runs after JwtAuthGuard (registered second in app.module's APP_GUARD list),
// so req.user is already populated when this executes.
// Routes with no @Roles() metadata are open to any authenticated user —
// this guard only restricts, it never grants access on its own.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) return false;
    return required.includes(normalizeUserRole(user.role) as UserRole);
  }
}
