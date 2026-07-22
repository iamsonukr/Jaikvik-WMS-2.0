import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('audit-logs')
@Roles(UserRole.ADMIN, UserRole.MASTER)
export class AuditLogController {
  constructor(private svc: AuditLogService) {}

  @Get()
  findAll(
    @Query('actorUserId') actorUserId?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findAll({
      actorUserId,
      targetType,
      targetId,
      action,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
