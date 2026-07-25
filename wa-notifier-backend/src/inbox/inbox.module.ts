import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './message.schema';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { TemplatesModule } from '../templates/templates.module';
import { WalletModule } from '../wallet/wallet.module';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { Plan, PlanSchema } from '../plans/plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
    WhatsAppAccountsModule,
    TemplatesModule,
    WalletModule,
  ],
  providers: [InboxService, MetaService, TenantOwnershipGuard],
  controllers: [InboxController],
  exports: [InboxService, MongooseModule],
})
export class InboxModule {}
