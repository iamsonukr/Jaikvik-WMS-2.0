import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

// Read-only, but still tenant-scoped data — without this guard, any
// authenticated user could pass another tenant's clientId and read their
// message/delivery/inbox stats.
@Controller('analytics')
@UseGuards(TenantOwnershipGuard)
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}
  @Get('overview') overview(@Query('clientId') cid: string)               { return this.svc.overview(cid); }
  @Get('daily')    daily(@Query('clientId') cid: string, @Query('days') d: string) { return this.svc.dailyStats(cid, +d || 30); }
  @Get('inbox')    inbox(@Query('clientId') cid: string)                  { return this.svc.inboxStats(cid); }
  @Get('alerts')   alerts(@Query('clientId') cid: string)                 { return this.svc.alerts(cid); }
}
