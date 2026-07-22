import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { CreateChatbotRuleDto, UpdateChatbotRuleDto } from './chatbot.dto';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

// This controller was missed in the original tenant-ownership rollout —
// findAll/create carry a clientId and are now guarded the same way
// contacts/templates/broadcasts/inbox are. update/remove operate on the
// rule's own :id (same residual gap documented on TenantOwnershipGuard).
@Controller('chatbot')
export class ChatbotController {
  constructor(private svc: ChatbotService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get() findAll(@Query('clientId') cid: string) { return this.svc.findAll(cid); }

  @UseGuards(TenantOwnershipGuard)
  @Post() create(@Body() dto: CreateChatbotRuleDto) { return this.svc.create(dto); }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateChatbotRuleDto) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
