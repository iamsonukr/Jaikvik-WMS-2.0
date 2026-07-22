import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppAccount, WhatsAppAccountSchema } from './whatsapp-account.schema';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { WhatsAppAccountsController } from './whatsapp-accounts.controller';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountOwnershipGuard } from './whatsapp-account-ownership.guard';

@Module({
  imports: [MongooseModule.forFeature([{ name: WhatsAppAccount.name, schema: WhatsAppAccountSchema }])],
  providers: [WhatsAppAccountsService, MetaService, WhatsAppAccountOwnershipGuard],
  controllers: [WhatsAppAccountsController],
  exports: [WhatsAppAccountsService, MongooseModule],
})
export class WhatsAppAccountsModule {}
