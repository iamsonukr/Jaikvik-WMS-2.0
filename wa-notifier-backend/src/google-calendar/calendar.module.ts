import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalendarConnection, CalendarConnectionSchema, CalendarOAuthState, CalendarOAuthStateSchema, CalendarRecipient, CalendarRecipientSchema, CalendarDelivery, CalendarDeliverySchema } from './calendar.schema';
import { CalendarAccountGuard, CalendarController, CalendarOAuthController } from './calendar.controller';
import { CalendarGoogleService } from './calendar-google.service';
import { CalendarService } from './calendar.service';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { InboxModule } from '../inbox/inbox.module';
import { TemplatesModule } from '../templates/templates.module';
import { Contact, ContactSchema } from '../contacts/contact.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
@Module({ imports: [WhatsAppAccountsModule, InboxModule, TemplatesModule, MongooseModule.forFeature([
  { name: CalendarConnection.name, schema: CalendarConnectionSchema },
  { name: CalendarOAuthState.name, schema: CalendarOAuthStateSchema },
  { name: CalendarRecipient.name, schema: CalendarRecipientSchema },
  { name: CalendarDelivery.name, schema: CalendarDeliverySchema },
  { name: Contact.name, schema: ContactSchema }, { name: Tenant.name, schema: TenantSchema },
])], controllers: [CalendarController, CalendarOAuthController], providers: [CalendarGoogleService, CalendarService, CalendarAccountGuard] })
export class CalendarModule {}
