import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { AccountAlert, AccountAlertSchema } from './account-alert.schema';
import { InboxModule } from '../inbox/inbox.module';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { MetaService } from '../common/meta.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AccountAlert.name, schema: AccountAlertSchema }]),
    InboxModule,
    BroadcastsModule,
    WhatsAppAccountsModule,
    ChatbotModule,
  ],
  controllers: [WebhooksController],
  providers: [MetaService],
})
export class WebhooksModule {}
