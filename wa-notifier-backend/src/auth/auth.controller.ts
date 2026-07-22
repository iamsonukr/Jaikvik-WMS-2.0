import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateStaffDto, LoginDto, RegisterDto, UpdateStaffDto } from './auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
}
