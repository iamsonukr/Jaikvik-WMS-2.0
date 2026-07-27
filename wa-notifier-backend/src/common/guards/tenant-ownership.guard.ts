import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { WhatsAppAccountsService } from '../../whatsapp-accounts/whatsapp-accounts.service';
import { UserRole } from '../enums/role.enum';

/**
 * Applied to routes that take a WhatsApp account reference (`clientId`) in
 * the query, route params, or body — contacts, templates, broadcasts,
 * inbox. This is what actually enforces "a client must never see another
 * client's contacts/campaigns/templates/messages" at the API level, not
 * just as a frontend convention (the frontend never gets a chance to leak
 * this — the backend rejects the request outright).
 *
 * ADMIN/MASTER pass through unconditionally — platform staff are
 * meant to be able to act on behalf of any onboarded client (e.g. "Master
 * Admin can send messages for any onboarded client using the existing
 * message-sending interface").
 *
 * Known gap: this only covers routes where clientId is present on the
 * request itself. Routes that mutate a resource by its OWN id (e.g.
 * `PATCH /contacts/:id`) don't carry a clientId and aren't covered here —
 * closing that gap requires a per-resource lookup (fetch the Contact,
 * check its clientId's tenant) added module-by-module. Flagging this
 * explicitly rather than leaving it undocumented.
 */
@Injectable()
export class TenantOwnershipGuard implements CanActivate {
  constructor(private whatsappAccounts: WhatsAppAccountsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    if (user.role === UserRole.ADMIN || user.role === UserRole.MASTER) return true;

    const whatsappAccountId =
      req.query?.whatsappAccountId ||
      req.params?.whatsappAccountId ||
      req.body?.whatsappAccountId ||
      req.query?.clientId ||
      req.params?.clientId ||
      req.body?.clientId;
    if (!whatsappAccountId) {
      // Fail closed: no account id to check ownership against on a route this
      // guard is attached to means we can't safely allow it through.
      throw new ForbiddenException('A whatsappAccountId is required for this request.');
    }

    const account = await this.whatsappAccounts.findOne(String(whatsappAccountId));
    if (!account || String(account.tenantId) !== String(user.tenantId)) {
      throw new ForbiddenException('You do not have access to this WhatsApp account.');
    }
    return true;
  }
}
