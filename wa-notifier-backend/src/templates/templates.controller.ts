import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { CreateTemplateDto } from './template.dto';

@Controller('templates')
@UseGuards(TenantOwnershipGuard) // every route here carries a clientId — safe at the controller level
export class TemplatesController {
  constructor(private svc: TemplatesService) {}
  @Get('library/:clientId') library(@Param('clientId') cid: string, @Query() query: Record<string, any>) { return this.svc.library(cid, query); }
  @Get()          findAll(@Query('clientId') cid: string) { return this.svc.findAll(cid); }
  @Post()         create(@Body() dto: CreateTemplateDto) { return this.svc.create(dto.clientId, dto); }
  @Post('sync/:clientId') sync(@Param('clientId') cid: string) { return this.svc.sync(cid); }
}
