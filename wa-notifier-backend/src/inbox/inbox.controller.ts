import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Controller('inbox')
export class InboxController {
  constructor(private svc: InboxService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get('threads')
  threads(@Query('clientId') cid: string) {
    return this.svc.threads(cid);
  }

  @UseGuards(TenantOwnershipGuard)
  @Get('messages')
  messages(@Query('clientId') cid: string, @Query('phone') phone: string) {
    return this.svc.messages(cid, phone);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('reply')
  reply(@Body() body: { clientId: string; phone: string; text: string }) {
    return this.svc.reply(body.clientId, body.phone, body.text);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('template')
  template(@Body() body: { clientId: string; phone: string; templateName: string; languageCode?: string; bodyParameters?: string[] }) {
    return this.svc.sendTemplate(
      body.clientId,
      body.phone,
      body.templateName,
      body.languageCode,
      body.bodyParameters || [],
    );
  }

  // No clientId on this route (thread id + userId only), so it is not covered
  // by TenantOwnershipGuard. See the guard's doc comment for this residual gap.
  @Post('assign/:id')
  assign(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.svc.assign(id, body.userId);
  }

  @UseGuards(TenantOwnershipGuard)
  @Post('resolve')
  resolve(@Body() body: { clientId: string; phone: string }) {
    return this.svc.resolve(body.clientId, body.phone);
  }
}
