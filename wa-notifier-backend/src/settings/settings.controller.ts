import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('settings')
@Roles(UserRole.ADMIN, UserRole.MASTER)
export class SettingsController {
  constructor(private svc: SettingsService) {}

  @Get() get() { return this.svc.get(); }
  @Patch() update(@Body() dto: any) { return this.svc.update(dto); }
}
