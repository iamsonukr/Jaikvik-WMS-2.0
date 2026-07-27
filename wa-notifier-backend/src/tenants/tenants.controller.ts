import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantBillingDto, UpdateTenantDto, UpdateTenantStatusDto } from './tenant.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

// Tenant management is platform-staff-only. Client-facing "my account" data
// (a tenant viewing its own record) is served from a separate endpoint in a
// later phase, scoped via @CurrentTenant() rather than an :id param.
// RolesGuard is registered globally in app.module, so @Roles() alone is enough here.
@Controller('tenants')
@Roles(UserRole.ADMIN, UserRole.MASTER)
export class TenantsController {
  constructor(private svc: TenantsService) {}

  @Get() findAll() { return this.svc.findAll(); }

  @Get('me/billing')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myBillingProfile(@CurrentTenant() tenantId: string) {
    return this.svc.findBillingProfile(tenantId);
  }

  @Patch('me/billing')
  @Roles(UserRole.CLIENT_OWNER)
  updateMyBillingProfile(@CurrentTenant() tenantId: string, @Body() dto: UpdateTenantBillingDto) {
    return this.svc.updateBillingProfile(tenantId, dto);
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateTenantDto) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTenantDto) { return this.svc.update(id, dto); }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN) // suspending/disabling a client is a master-admin-level action
  setStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.svc.setStatus(id, dto.status);
  }
}
