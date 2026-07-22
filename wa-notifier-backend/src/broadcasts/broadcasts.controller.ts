import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto, UpdateBroadcastDto } from './broadcast.dto';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

// Only findAll/create carry a clientId directly — the rest operate on a
// broadcast's own :id (see TenantOwnershipGuard's doc comment for this
// residual gap), so the guard is applied per-route, not controller-wide.
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private svc: BroadcastsService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get()           findAll(@Query('clientId') cid: string) { return this.svc.findAll(cid); }
  @Get(':id')      findOne(@Param('id') id: string)        { return this.svc.findOne(id); }
  @Get(':id/logs') logs(@Param('id') id: string)           { return this.svc.logs(id); }
  @Get(':id/estimate') estimate(@Param('id') id: string)   { return this.svc.estimate(id); }
  @UseGuards(TenantOwnershipGuard)
  @Post()          create(@Body() dto: CreateBroadcastDto)                 { return this.svc.create(dto); }
  @Patch(':id')    update(@Param('id') id: string, @Body() dto: UpdateBroadcastDto) { return this.svc.update(id, dto); }
  @Post(':id/send')
  async send(@Param('id') id: string) {
    // Validate + reserve wallet funds synchronously so an insufficient
    // balance surfaces as an error right away, then run the actual send
    // loop in the background so large recipient lists don't time out.
    const prepared = await this.svc.prepareSend(id);
    this.svc.runSendLoop(prepared).catch(() => null);
    return { message: 'Broadcast started', broadcastId: id, recipients: prepared.contacts.length };
  }
}
