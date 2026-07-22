import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { UserRole } from '../common/enums/role.enum';

/**
 * Guards the WhatsAppAccountsController's `:id`-based routes (findOne,
 * update, remove, subscribeWebhooks, registerPhoneNumber, sendingDiagnostics)
 * where the `:id` param IS the WhatsAppAccount's own id — distinct from
 * TenantOwnershipGuard, which checks a `clientId` reference on OTHER
 * resources (contacts, templates, broadcasts, inbox).
 *
 * Without this, a tenant-scoped user could read, edit, or even delete
 * another tenant's WhatsApp account (and its Meta credentials) just by
 * knowing or guessing its id — this is the actual enforcement of "a client
 * must never see another client's WhatsApp numbers" for this controller.
 */
@Injectable()
export class WhatsAppAccountOwnershipGuard implements CanActivate {
  constructor(private whatsappAccounts: WhatsAppAccountsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    if (user.role === UserRole.ADMIN || user.role === UserRole.MASTER) return true;

    const id = req.params?.id;
    if (!id) return false;

    const account = await this.whatsappAccounts.findOne(id);
    if (!account) throw new NotFoundException('WhatsApp account not found');
    if (String(account.tenantId) !== String(user.tenantId)) {
      throw new ForbiddenException('You do not have access to this WhatsApp account.');
    }
    return true;
  }
}
