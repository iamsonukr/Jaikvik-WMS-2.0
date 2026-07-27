import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get()
  list(@Query('whatsappAccountId') whatsappAccountId: string, @Query('clientId') clientId: string): Promise<any[]> {
    return this.alerts.list(whatsappAccountId || clientId);
  }
}
