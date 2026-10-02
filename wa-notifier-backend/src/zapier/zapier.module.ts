import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ZapierAction, ZapierActionSchema, ZapierConnection, ZapierConnectionSchema, ZapierDelivery, ZapierDeliverySchema, ZapierHook, ZapierHookSchema } from './zapier.schema';
import { ZapierService } from './zapier.service';
import { ZapierWorker } from './zapier.worker';
import { ZapierAccountGuard, ZapierApiController, ZapierKeyGuard, ZapierManagementController } from './zapier.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { InboxModule } from '../inbox/inbox.module';
import { TemplatesModule } from '../templates/templates.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { BroadcastLog, BroadcastLogSchema } from '../broadcasts/broadcast.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';

@Module({
  imports: [ContactsModule, InboxModule, TemplatesModule, WhatsAppAccountsModule, MongooseModule.forFeature([
    { name: ZapierConnection.name, schema: ZapierConnectionSchema }, { name: ZapierHook.name, schema: ZapierHookSchema },
    { name: ZapierDelivery.name, schema: ZapierDeliverySchema }, { name: ZapierAction.name, schema: ZapierActionSchema },
    { name: Contact.name, schema: ContactSchema }, { name: BroadcastLog.name, schema: BroadcastLogSchema }, { name: Tenant.name, schema: TenantSchema },
  ])],
  controllers: [ZapierManagementController, ZapierApiController],
  providers: [ZapierService, ZapierWorker, ZapierAccountGuard, ZapierKeyGuard],
})
export class ZapierModule {}
