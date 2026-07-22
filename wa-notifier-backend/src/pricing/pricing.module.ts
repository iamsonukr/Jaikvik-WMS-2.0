import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagePricing, MessagePricingSchema } from './message-pricing.schema';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessagePricing.name, schema: MessagePricingSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService, MongooseModule],
})
export class PricingModule {}
