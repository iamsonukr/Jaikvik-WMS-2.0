import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppAccount, WhatsAppAccountSchema } from './whatsapp-account.schema';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { WhatsAppAccountsController } from './whatsapp-accounts.controller';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountOwnershipGuard } from './whatsapp-account-ownership.guard';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { ContactImport, ContactImportSchema } from '../contacts/contact-import.schema';
import { ContactSegment, ContactSegmentSchema } from '../contacts/contact-segment.schema';
import { ContactTag, ContactTagSchema } from '../contacts/contact-tag.schema';
import { Broadcast, BroadcastLog, BroadcastLogSchema, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { Message, MessageSchema } from '../inbox/message.schema';
import { Template, TemplateSchema } from '../templates/template.schema';
import { ChatbotRule, ChatbotRuleSchema } from '../chatbot/chatbot-rule.schema';
import { AccountAlert, AccountAlertSchema } from '../webhooks/account-alert.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsAppAccount.name, schema: WhatsAppAccountSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: ContactImport.name, schema: ContactImportSchema },
      { name: ContactSegment.name, schema: ContactSegmentSchema },
      { name: ContactTag.name, schema: ContactTagSchema },
      { name: Broadcast.name, schema: BroadcastSchema },
      { name: BroadcastLog.name, schema: BroadcastLogSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Template.name, schema: TemplateSchema },
      { name: ChatbotRule.name, schema: ChatbotRuleSchema },
      { name: AccountAlert.name, schema: AccountAlertSchema },
    ]),
    SubscriptionsModule,
  ],
  providers: [WhatsAppAccountsService, MetaService, WhatsAppAccountOwnershipGuard],
  controllers: [WhatsAppAccountsController],
  exports: [WhatsAppAccountsService, MongooseModule],
})
export class WhatsAppAccountsModule {}
