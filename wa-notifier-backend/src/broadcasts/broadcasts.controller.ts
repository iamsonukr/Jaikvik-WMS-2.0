import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto, TestBroadcastDto, UpdateBroadcastDto } from './broadcast.dto';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { ResourceOwnership } from '../common/decorators/resource-ownership.decorator';
import { ResourceOwnershipGuard } from '../common/guards/resource-ownership.guard';

// Only findAll/create carry a clientId directly — the rest operate on a
// broadcast's own :id (see TenantOwnershipGuard's doc comment for this
// residual gap), so the guard is applied per-route, not controller-wide.
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private svc: BroadcastsService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get()           findAll(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string) { return this.svc.findAll(aid || cid); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Get(':id')      findOne(@Param('id') id: string)        { return this.svc.findOne(id); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Get(':id/logs') logs(@Param('id') id: string)           { return this.svc.logs(id); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Get(':id/estimate') estimate(@Param('id') id: string)   { return this.svc.estimate(id); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Get(':id/logs/export')
  async exportLogs(@Param('id') id: string, @Res() res: Response) {
    const { filename, csv } = await this.svc.exportLogsCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }
  @UseGuards(TenantOwnershipGuard)
  @Post()          create(@Body() dto: CreateBroadcastDto)                 { return this.svc.create(dto); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Patch(':id')    update(@Param('id') id: string, @Body() dto: UpdateBroadcastDto) { return this.svc.update(id, dto); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Post(':id/schedule') schedule(@Param('id') id: string, @Body() body: { scheduledAt: string }) { return this.svc.schedule(id, body.scheduledAt); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Post(':id/pause') pause(@Param('id') id: string) { return this.svc.pause(id); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Post(':id/cancel') cancel(@Param('id') id: string) { return this.svc.cancel(id); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Post(':id/duplicate') duplicate(@Param('id') id: string) { return this.svc.duplicate(id); }
  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
  @Post(':id/test') test(@Param('id') id: string, @Body() dto: TestBroadcastDto) { return this.svc.sendTest(id, dto.phone); }

  @ResourceOwnership('broadcasts')
  @UseGuards(ResourceOwnershipGuard)
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
