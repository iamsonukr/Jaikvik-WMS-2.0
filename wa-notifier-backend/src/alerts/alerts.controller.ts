import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @UseGuards(TenantOwnershipGuard)
  @Get()
  list(
    @Query('whatsappAccountId') whatsappAccountId: string,
    @Query('clientId') clientId: string,
    @CurrentUser() user: any,
  ): Promise<any[]> {
    return this.alerts.list(whatsappAccountId || clientId, user);
  }
}
