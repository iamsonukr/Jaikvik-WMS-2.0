import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscription, SubscriptionSchema } from './subscription.schema';
import { Plan, PlanSchema } from '../plans/plan.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService, MongooseModule],
})
export class SubscriptionsModule {}
