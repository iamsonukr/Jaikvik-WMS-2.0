import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Template, TemplateSchema } from './template.schema';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }]),
    WhatsAppAccountsModule,
  ],
  providers: [TemplatesService, MetaService, TenantOwnershipGuard],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
