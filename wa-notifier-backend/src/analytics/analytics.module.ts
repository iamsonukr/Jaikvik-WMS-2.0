import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { Broadcast, BroadcastSchema, BroadcastLog, BroadcastLogSchema } from '../broadcasts/broadcast.schema';
import { Message, MessageSchema } from '../inbox/message.schema';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { AccountAlert, AccountAlertSchema } from '../webhooks/account-alert.schema';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Broadcast.name, schema: BroadcastSchema },
      { name: BroadcastLog.name, schema: BroadcastLogSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: AccountAlert.name, schema: AccountAlertSchema },
    ]),
    WhatsAppAccountsModule,
  ],
  providers: [AnalyticsService, TenantOwnershipGuard],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
