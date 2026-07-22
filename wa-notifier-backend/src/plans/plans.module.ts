import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Plan, PlanSchema } from './plan.schema';
import { Subscription, SubscriptionSchema } from '../subscriptions/subscription.schema';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  providers: [PlansService],
  controllers: [PlansController],
  exports: [PlansService, MongooseModule],
})
export class PlansModule {}
