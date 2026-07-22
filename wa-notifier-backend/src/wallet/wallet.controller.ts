import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ManualAdjustmentDto } from './wallet.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('wallet')
export class WalletController {
  constructor(private svc: WalletService) {}

  // Client-facing — tenant resolved from the JWT, never a client-supplied ID.
  @Get('me')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myBalance(@CurrentTenant() tenantId: string) {
    return this.svc.getBalance(tenantId);
  }

  @Get('me/transactions')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myLedger(@CurrentTenant() tenantId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getLedger(tenantId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 25);
  }

  // Platform-wide revenue snapshot for the Admin dashboard charts. Placed
  // before ':tenantId' so Nest doesn't try to match 'summary' as an id.
  @Get('admin/summary')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  platformSummary() {
    return this.svc.platformSummary();
  }

  // Staff view of any tenant's wallet.
  @Get(':tenantId')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  balance(@Param('tenantId') tenantId: string) {
    return this.svc.getBalance(tenantId);
  }

  @Get(':tenantId/transactions')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  ledger(@Param('tenantId') tenantId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getLedger(tenantId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 25);
  }

  @Post(':tenantId/adjust')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  adjust(@Param('tenantId') tenantId: string, @Body() dto: ManualAdjustmentDto, @Req() req: any) {
    return this.svc.manualAdjust(tenantId, dto.direction, dto.amount, dto.reason, req.user._id, req.user.role);
  }
}
