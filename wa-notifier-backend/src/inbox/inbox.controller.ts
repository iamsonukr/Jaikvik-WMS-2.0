import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResourceOwnership } from '../common/decorators/resource-ownership.decorator';
import { ResourceOwnershipGuard } from '../common/guards/resource-ownership.guard';

@Controller('inbox')
export class InboxController {
  constructor(private svc: InboxService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get('threads')
  threads(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string) {
    return this.svc.threads(aid || cid);
  }

  @UseGuards(TenantOwnershipGuard)
  @Get('messages')
  messages(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string, @Query('phone') phone: string) {
    return this.svc.messages(aid || cid, phone);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('reply')
  reply(@Body() body: { whatsappAccountId?: string; clientId?: string; phone: string; text: string }) {
    return this.svc.reply(body.whatsappAccountId || body.clientId, body.phone, body.text);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('template')
  template(@Body() body: { whatsappAccountId?: string; clientId?: string; phone: string; templateName: string; languageCode?: string; bodyParameters?: string[] }) {
    return this.svc.sendTemplate(
      body.whatsappAccountId || body.clientId,
      body.phone,
      body.templateName,
      body.languageCode,
      body.bodyParameters || [],
    );
  }

  @ResourceOwnership('messages')
  @UseGuards(ResourceOwnershipGuard)
  @Post('assign/:id')
  assign(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.svc.assign(id, body.userId);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('thread/assign')
  assignThread(@Body() body: { whatsappAccountId?: string; clientId?: string; phone: string; userId?: string }) {
    return this.svc.assignThread(body.whatsappAccountId || body.clientId, body.phone, body.userId);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('thread/update')
  updateThread(@Body() body: { whatsappAccountId?: string; clientId?: string; phone: string; threadStatus?: string; priority?: string; slaDueAt?: string | null; threadTags?: string[] }) {
    return this.svc.updateThread(body.whatsappAccountId || body.clientId, body.phone, body);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('thread/notes')
  addNote(@Body() body: { whatsappAccountId?: string; clientId?: string; phone: string; text: string }, @CurrentUser() user: any) {
    return this.svc.addNote(body.whatsappAccountId || body.clientId, body.phone, body.text, user);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('resolve')
  resolve(@Body() body: { whatsappAccountId?: string; clientId?: string; phone: string }) {
    return this.svc.resolve(body.whatsappAccountId || body.clientId, body.phone);
  }
}
