import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { ResourceOwnershipMetadata, RESOURCE_OWNERSHIP_KEY } from '../decorators/resource-ownership.decorator';
import { UserRole } from '../enums/role.enum';
import { WhatsAppAccountsService } from '../../whatsapp-accounts/whatsapp-accounts.service';

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectConnection() private connection: Connection,
    private whatsappAccounts: WhatsAppAccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    if (user.role === UserRole.ADMIN || user.role === UserRole.MASTER) return true;

    const meta = this.reflector.getAllAndOverride<ResourceOwnershipMetadata>(RESOURCE_OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) throw new ForbiddenException('Resource ownership metadata is missing.');

    const id = req.params?.[meta.param || 'id'];
    if (!Types.ObjectId.isValid(id)) throw new ForbiddenException('You do not have access to this resource.');

    const resource = await this.connection.collection(meta.collection).findOne(
      { _id: new Types.ObjectId(id) },
      { projection: { tenantId: 1, whatsappAccountId: 1 } },
    );
    if (!resource) throw new ForbiddenException('You do not have access to this resource.');

    if (resource.tenantId && String(resource.tenantId) === String(user.tenantId)) return true;

    if (resource.whatsappAccountId) {
      const account = await this.whatsappAccounts.findOne(String(resource.whatsappAccountId));
      if (account?.tenantId && String(account.tenantId) === String(user.tenantId)) return true;
    }

    throw new ForbiddenException('You do not have access to this resource.');
  }
}
