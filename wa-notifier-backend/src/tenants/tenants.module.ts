import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from './tenant.schema';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Tenant.name, schema: TenantSchema }])],
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService, MongooseModule],
})
export class TenantsModule {}
