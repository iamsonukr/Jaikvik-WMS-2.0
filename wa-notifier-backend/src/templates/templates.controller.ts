import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TenantOwnershipGuard } from '../common/guards/tenant-ownership.guard';

@Controller('templates')
@UseGuards(TenantOwnershipGuard) // every route here carries a clientId — safe at the controller level
export class TemplatesController {
  constructor(private svc: TemplatesService) {}
  @Get()          findAll(@Query('clientId') cid: string) { return this.svc.findAll(cid); }
  @Post('sync/:clientId') sync(@Param('clientId') cid: string) { return this.svc.sync(cid); }
}
