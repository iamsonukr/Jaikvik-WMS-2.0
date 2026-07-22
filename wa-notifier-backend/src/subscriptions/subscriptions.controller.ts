import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import {
  AssignSubscriptionDto,
  CancelSubscriptionDto,
  ChangeSubscriptionPlanDto,
  ExtendSubscriptionDto,
} from './subscription.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private svc: SubscriptionsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  findAll() {
    return this.svc.findAll();
  }

  @Get('tenant/:tenantId')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.svc.findByTenant(tenantId);
  }

  // Client-facing: their own current subscription, resolved from the JWT —
  // never from a client-supplied tenantId.
  @Get('me')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  me(@CurrentTenant() tenantId: string) {
    return this.svc.currentForTenant(tenantId);
  }

  @Post('assign')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  assign(@Body() dto: AssignSubscriptionDto) {
    return this.svc.assign(dto);
  }

  @Patch(':id/change-plan')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  changePlan(@Param('id') id: string, @Body() dto: ChangeSubscriptionPlanDto) {
    return this.svc.changePlan(id, dto);
  }

  @Patch(':id/extend')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  extend(@Param('id') id: string, @Body() dto: ExtendSubscriptionDto) {
    return this.svc.extend(id, dto);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  cancel(@Param('id') id: string, @Body() dto: CancelSubscriptionDto) {
    return this.svc.cancel(id, dto.reason);
  }

  @Patch(':id/revoke')
  @Roles(UserRole.ADMIN)
  revoke(@Param('id') id: string, @Body() dto: CancelSubscriptionDto) {
    return this.svc.revoke(id, dto.reason);
  }
}
