import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { CreateMessagePricingDto, UpdateMessagePricingDto } from './message-pricing.dto';
import { MessageCategory } from './message-pricing.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('pricing')
@Roles(UserRole.ADMIN, UserRole.MASTER)
export class PricingController {
  constructor(private svc: PricingService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  // Lets staff verify what a tenant would actually be charged, using the
  // same resolver the send-flow will call — never a separate calculation.
  @Get('resolve')
  resolve(
    @Query('tenantId') tenantId: string,
    @Query('category') category: MessageCategory,
    @Query('country') country: string,
  ) {
    return this.svc.resolvePrice(tenantId, category, country || 'default');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMessagePricingDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMessagePricingDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
