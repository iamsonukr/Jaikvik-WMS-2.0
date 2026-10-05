import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalendlyBooking, CalendlyBookingSchema, CalendlyConnection, CalendlyConnectionSchema, CalendlyJob, CalendlyJobSchema } from './calendly.schema';
import { CalendlyAccountGuard, CalendlyController, CalendlyWebhookController } from './calendly.controller';
import { CalendlyService } from './calendly.service';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { InboxModule } from '../inbox/inbox.module';
import { TemplatesModule } from '../templates/templates.module';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { Contact, ContactSchema } from '../contacts/contact.schema';

@Module({ imports: [WhatsAppAccountsModule, InboxModule, TemplatesModule, MongooseModule.forFeature([
  { name: CalendlyConnection.name, schema: CalendlyConnectionSchema },
  { name: CalendlyBooking.name, schema: CalendlyBookingSchema },
  { name: CalendlyJob.name, schema: CalendlyJobSchema },
  { name: Tenant.name, schema: TenantSchema }, { name: Contact.name, schema: ContactSchema },
])], controllers: [CalendlyController, CalendlyWebhookController], providers: [CalendlyService, CalendlyAccountGuard] })
export class CalendlyModule {}
