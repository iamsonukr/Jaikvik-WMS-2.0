import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
export class ExpensesController {
  constructor(private svc: ExpensesService) {}

  @Get('admin/summary')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  adminSummary(@Query('period') period?: 'month' | 'year' | 'all') {
    return this.svc.adminSummary(['month', 'year', 'all'].includes(String(period)) ? period : 'month');
  }

  @Get('admin/client-detail')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  adminClientDetail(
    @Query('tenantId') tenantId: string,
    @Query('accountId') accountId?: string,
    @Query('period') period?: 'month' | 'year' | 'all',
  ) {
    return this.svc.adminClientDetail(
      ['month', 'year', 'all'].includes(String(period)) ? period : 'month',
      tenantId,
      accountId,
    );
  }

  @Post('admin/sync')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  syncMetaPricing(@Query('period') period?: 'month' | 'year' | 'all') {
    return this.svc.syncMetaPricing(['month', 'year', 'all'].includes(String(period)) ? period : 'month');
  }

  @Post('admin/manual')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  saveManualMetaCost(@Query('period') period: 'month' | 'year' | 'all' = 'month', @Body() body: any) {
    return this.svc.saveManualMetaCost(['month', 'year', 'all'].includes(String(period)) ? period : 'month', body);
  }
}
