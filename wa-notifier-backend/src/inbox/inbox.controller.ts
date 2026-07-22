import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Controller('inbox')
export class InboxController {
  constructor(private svc: InboxService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get('threads')  threads(@Query('clientId') cid: string)                              { return this.svc.threads(cid); }

  @UseGuards(TenantOwnershipGuard)
  @Get('messages') messages(@Query('clientId') cid: string, @Query('phone') p: string) { return this.svc.messages(cid, p); }

  @UseGuards(TenantOwnershipGuard)
  @Post('reply')   reply(@Body() b: { clientId: string; phone: string; text: string }) { return this.svc.reply(b.clientId, b.phone, b.text); }

  // No clientId on this route (thread id + userId only) — not covered by
  // TenantOwnershipGuard; see the guard's doc comment for this residual gap.
  @Post('assign/:id') assign(@Param('id') id: string, @Body() b: { userId: string })   { return this.svc.assign(id, b.userId); }

  @UseGuards(TenantOwnershipGuard)
  @Post('resolve') resolve(@Body() b: { clientId: string; phone: string })              { return this.svc.resolve(b.clientId, b.phone); }
}
