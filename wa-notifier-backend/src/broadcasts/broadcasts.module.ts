import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Broadcast, BroadcastSchema, BroadcastLog, BroadcastLogSchema } from './broadcast.schema';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsController } from './broadcasts.controller';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { ContactsModule } from '../contacts/contacts.module';
import { TemplatesModule } from '../templates/templates.module';
import { PricingModule } from '../pricing/pricing.module';
import { WalletModule } from '../wallet/wallet.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Broadcast.name, schema: BroadcastSchema },
      { name: BroadcastLog.name, schema: BroadcastLogSchema },
    ]),
    WhatsAppAccountsModule,
    ContactsModule,
    TemplatesModule,
    PricingModule,
    WalletModule,
  ],
  providers: [BroadcastsService, MetaService, TenantOwnershipGuard],
  controllers: [BroadcastsController],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
