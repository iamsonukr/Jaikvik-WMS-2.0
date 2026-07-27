import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';
import { CreateTemplateDto } from './template.dto';

@Controller('templates')
@UseGuards(TenantOwnershipGuard) // every route here carries a clientId — safe at the controller level
export class TemplatesController {
  constructor(private svc: TemplatesService) {}
  @Get('library/:whatsappAccountId') library(@Param('whatsappAccountId') aid: string, @Query() query: Record<string, any>) { return this.svc.library(aid, query); }
  @Get('library/client/:clientId') legacyLibrary(@Param('clientId') cid: string, @Query() query: Record<string, any>) { return this.svc.library(cid, query); }
  @Get()          findAll(@Query('whatsappAccountId') aid: string, @Query('clientId') cid: string) { return this.svc.findAll(aid || cid); }
  @Post()         create(@Body() dto: CreateTemplateDto) { return this.svc.create(dto.whatsappAccountId || dto.clientId, dto); }
  @Post('sync/:whatsappAccountId') sync(@Param('whatsappAccountId') aid: string) { return this.svc.sync(aid); }
  @Post('sync/client/:clientId') legacySync(@Param('clientId') cid: string) { return this.svc.sync(cid); }
}
