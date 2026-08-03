import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateStaffDto, CreateTenantUserDto, LoginDto, RegisterDto, ResetTenantUserPasswordDto, UpdateStaffDto, UpdateTenantTeamUserDto, UpdateTenantUserDto } from './auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public() @Post('register') register(@Body() dto: RegisterDto) { return this.authService.register(dto); }
  @Public() @Post('login')    login(@Body() dto: LoginDto)       { return this.authService.login(dto); }

  @Get('me')
  me(@CurrentUser() user: any) { return this.authService.me(user._id); }

  @Patch('me')
  updateProfile(@CurrentUser() user: any, @Body() body: { name?: string; email?: string }) {
    return this.authService.updateProfile(user._id, body);
  }

  @Patch('password')
  updatePassword(@CurrentUser() user: any, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.updatePassword(user._id, body.currentPassword, body.newPassword);
  }

  @Get('team')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myTeam(@CurrentTenant() tenantId: string) {
    return this.authService.listTenantUsers(tenantId);
  }

  @Get('team/limit')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myTeamLimit(@CurrentTenant() tenantId: string) {
    return this.authService.getTeamLimit(tenantId);
  }

  @Post('team')
  @Roles(UserRole.CLIENT_OWNER)
  createTeamMember(@CurrentTenant() tenantId: string, @Body() dto: CreateTenantUserDto) {
    return this.authService.createTeamMember(tenantId, dto);
  }

  @Patch('team/:id')
  @Roles(UserRole.CLIENT_OWNER)
  updateTeamMember(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateTenantTeamUserDto) {
    return this.authService.updateTeamMember(tenantId, id, dto, user._id);
  }

  @Patch('team/:id/password')
  @Roles(UserRole.CLIENT_OWNER)
  resetTeamMemberPassword(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: ResetTenantUserPasswordDto) {
    return this.authService.resetTeamMemberPassword(tenantId, id, dto.newPassword);
  }

  @Delete('team/:id')
  @Roles(UserRole.CLIENT_OWNER)
  removeTeamMember(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.authService.removeTeamMember(tenantId, id, user._id);
  }

  // Platform staff management — creating an admin/master account is a
  // admin-only action, deliberately not exposed to 'master' itself.
  @Get('staff')
  @Roles(UserRole.ADMIN)
  listStaff() { return this.authService.listStaff(); }

  @Post('staff')
  @Roles(UserRole.ADMIN)
  createStaff(@Body() dto: CreateStaffDto) { return this.authService.createStaff(dto); }

  @Patch('staff/:id')
  @Roles(UserRole.ADMIN)
  updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto) { return this.authService.updateStaff(id, dto); }

  @Get('tenant-users/:tenantId')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  listTenantUsers(@Param('tenantId') tenantId: string) {
    return this.authService.listTenantUsers(tenantId);
  }

  @Post('tenant-users/:tenantId')
  @Roles(UserRole.ADMIN)
  createTenantUser(@Param('tenantId') tenantId: string, @Body() dto: CreateTenantUserDto) {
    return this.authService.createTenantUser(tenantId, dto);
  }

  @Patch('tenant-users/:id/password')
  @Roles(UserRole.ADMIN)
  resetTenantUserPassword(@Param('id') id: string, @Body() dto: ResetTenantUserPasswordDto) {
    return this.authService.resetTenantUserPassword(id, dto.newPassword);
  }

  @Patch('tenant-users/:id')
  @Roles(UserRole.ADMIN)
  updateTenantUser(@Param('id') id: string, @Body() dto: UpdateTenantUserDto) {
    return this.authService.updateTenantUser(id, dto);
  }

  @Delete('tenant-users/:id')
  @Roles(UserRole.ADMIN)
  removeTenantUser(@Param('id') id: string) {
    return this.authService.removeTenantUser(id);
  }
}
