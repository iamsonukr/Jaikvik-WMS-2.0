import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatbotRule, ChatbotRuleSchema } from './chatbot-rule.schema';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatbotRule.name, schema: ChatbotRuleSchema }]),
    WhatsAppAccountsModule,
  ],
  providers: [ChatbotService, TenantOwnershipGuard],
  controllers: [ChatbotController],
  exports: [ChatbotService],
})
export class ChatbotModule {}
