import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { Wallet, WalletSchema } from '../wallet/wallet.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/subscription.schema';
import { RazorpayPayment, RazorpayPaymentSchema } from '../payments/razorpay-payment.schema';
import { Template, TemplateSchema } from '../templates/template.schema';
import { Broadcast, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { AccountAlert, AccountAlertSchema } from '../webhooks/account-alert.schema';
import { Message, MessageSchema } from '../inbox/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: RazorpayPayment.name, schema: RazorpayPaymentSchema },
      { name: Template.name, schema: TemplateSchema },
      { name: Broadcast.name, schema: BroadcastSchema },
      { name: AccountAlert.name, schema: AccountAlertSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    WhatsAppAccountsModule,
  ],
  providers: [AlertsService, TenantOwnershipGuard],
  controllers: [AlertsController],
})
export class AlertsModule {}
