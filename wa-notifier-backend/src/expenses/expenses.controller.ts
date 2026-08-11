import { Controller, Get, Query } from '@nestjs/common';
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
}
