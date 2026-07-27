import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RazorpayPayment, RazorpayPaymentSchema } from './razorpay-payment.schema';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Plan, PlanSchema } from '../plans/plan.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RazorpayPayment.name, schema: RazorpayPaymentSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
    WalletModule,
    SubscriptionsModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService, MongooseModule],
})
export class PaymentsModule {}
