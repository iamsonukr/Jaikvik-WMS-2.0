import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { WhatsAppAccountsModule } from './whatsapp-accounts/whatsapp-accounts.module';
import { ContactsModule } from './contacts/contacts.module';
import { TemplatesModule } from './templates/templates.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { InboxModule } from './inbox/inbox.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentsModule } from './payments/payments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { SettingsModule } from './settings/settings.module';
import { AlertsModule } from './alerts/alerts.module';
import { TicketsModule } from './tickets/tickets.module';
import { ExpensesModule } from './expenses/expenses.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ResourceOwnershipGuard } from './common/guards/resource-ownership.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({ uri: cfg.get('MONGODB_URI') }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    TenantsModule,
    WhatsAppAccountsModule,
    ContactsModule,
    TemplatesModule,
    BroadcastsModule,
    InboxModule,
    ChatbotModule,
    AnalyticsModule,
    WebhooksModule,
    PlansModule,
    SubscriptionsModule,
    WalletModule,
    PaymentsModule,
    AuditLogModule,
    SettingsModule,
    AlertsModule,
    TicketsModule,
    ExpensesModule,
  ],
  providers: [
    // Guards run in registration order: JwtAuthGuard populates req.user first
    // (or short-circuits for @Public() routes), then RolesGuard checks @Roles()
    // metadata against req.user.role. Routes with no @Roles() are unrestricted
    // to any authenticated user, same as before this change.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    ResourceOwnershipGuard,
  ],
})
export class AppModule {}
