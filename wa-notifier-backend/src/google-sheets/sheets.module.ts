import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SheetsConnection, SheetsConnectionSchema, SheetsEvent, SheetsEventSchema, SheetsOAuthState, SheetsOAuthStateSchema } from './sheets.schema';
import { SheetsGoogleService } from './sheets-google.service';
import { SheetsService } from './sheets.service';
import { SheetsAccountGuard, SheetsController, SheetsOAuthController } from './sheets.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { InboxModule } from '../inbox/inbox.module';
import { TemplatesModule } from '../templates/templates.module';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { BroadcastLog, BroadcastLogSchema } from '../broadcasts/broadcast.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';

@Module({
  imports: [ContactsModule, InboxModule, TemplatesModule, WhatsAppAccountsModule, MongooseModule.forFeature([
    { name: SheetsConnection.name, schema: SheetsConnectionSchema }, { name: SheetsEvent.name, schema: SheetsEventSchema },
    { name: SheetsOAuthState.name, schema: SheetsOAuthStateSchema }, { name: Contact.name, schema: ContactSchema },
    { name: BroadcastLog.name, schema: BroadcastLogSchema }, { name: Tenant.name, schema: TenantSchema },
  ])],
  controllers: [SheetsOAuthController, SheetsController],
  providers: [SheetsAccountGuard, SheetsGoogleService, SheetsService],
})
export class SheetsModule {}
