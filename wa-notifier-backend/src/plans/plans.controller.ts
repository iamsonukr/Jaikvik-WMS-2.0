import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto, ReorderPlansDto, UpdatePlanDto } from './plan.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('plans')
export class PlansController {
  constructor(private svc: PlansService) {}

  // Public pricing page reads this — never hardcode plans in the frontend.
  @Public()
  @Get('public')
  findPublic() {
    return this.svc.findPublic();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  create(@Body() dto: CreatePlanDto) {
    return this.svc.create(dto);
  }

  @Patch('reorder')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  reorder(@Body() dto: ReorderPlansDto) {
    return this.svc.reorder(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/disable')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  disable(@Param('id') id: string) {
    return this.svc.disable(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
