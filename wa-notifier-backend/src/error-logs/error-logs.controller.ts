import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { ErrorLogsService } from './error-logs.service';

@Controller('error-logs')
@Roles(UserRole.ADMIN)
export class ErrorLogsController {
  constructor(private service: ErrorLogsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.findAll(Number(page) || 1, Number(limit) || 25);
  }
}
