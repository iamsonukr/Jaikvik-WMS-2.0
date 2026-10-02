import { Body, CanActivate, Controller, Delete, ExecutionContext, ForbiddenException, Get, Injectable, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Types } from 'mongoose';
import { Public } from '../common/decorators/public.decorator';
import { ZapierService } from './zapier.service';
import { CreateZapierHookDto, ToggleZapierHookDto, ZapierContactDto, ZapierSendDto } from './zapier.dto';

@Injectable()
export class ZapierAccountGuard implements CanActivate {
  constructor(private service: ZapierService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const id = req.params.whatsappAccountId;
    if (!req.user || !Types.ObjectId.isValid(id)) throw new ForbiddenException('Invalid account.');
    const account = await this.service.activeAccount(id);
    if (!['admin', 'master'].includes(req.user.role) &&
      (req.user.role !== 'client_owner' || String(req.user.tenantId) !== String(account.tenantId))) {
      throw new ForbiddenException('Only the client owner or platform staff can manage this integration.');
    }
    return true;
  }
}
@Injectable()
export class ZapierKeyGuard implements CanActivate {
  constructor(private service: ZapierService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    res.setHeader('Cache-Control', 'no-store');
    try { req.zapier = await this.service.authenticate(req.headers['x-api-key']); }
    catch (error) { if (error?.getStatus?.() === 429) res.setHeader('Retry-After', '60'); throw error; }
    return true;
  }
}

@Controller('integrations/zapier/:whatsappAccountId')
@UseGuards(ZapierAccountGuard)
export class ZapierManagementController {
  constructor(private service: ZapierService) {}
  @Get() status(@Param('whatsappAccountId') id: string) { return this.service.status(id); }
  @Post('key') key(@Param('whatsappAccountId') id: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.generateKey(id);
  }
  @Delete('connection') revoke(@Param('whatsappAccountId') id: string) { return this.service.revoke(id); }
  @Post('hooks') createHook(@Param('whatsappAccountId') id: string, @Body() dto: CreateZapierHookDto) { return this.service.createHook(id, dto); }
  @Patch('hooks/:hookId') toggle(@Param('whatsappAccountId') id: string, @Param('hookId') hookId: string, @Body() dto: ToggleZapierHookDto) {
    return this.service.toggleHook(id, hookId, dto.enabled);
  }
  @Delete('hooks/:hookId') remove(@Param('whatsappAccountId') id: string, @Param('hookId') hookId: string) { return this.service.removeHook(id, hookId); }
  @Post('hooks/:hookId/test') test(@Param('whatsappAccountId') id: string, @Param('hookId') hookId: string) { return this.service.testHook(id, hookId); }
  @Post('deliveries/:deliveryId/retry') retry(@Param('whatsappAccountId') id: string, @Param('deliveryId') deliveryId: string) { return this.service.retryDelivery(id, deliveryId); }
}

// Public bypasses session JWT only. Every route still requires a scoped API
// key, and account identity always comes from that key, never the request body.
@Public()
@UseGuards(ZapierKeyGuard)
@Controller('zapier/v1')
export class ZapierApiController {
  constructor(private service: ZapierService) {}
  @Get('me') me(@Req() req: any) { return { id: req.zapier.accountId, name: req.zapier.accountName }; }
  @Get('templates') templates(@Req() req: any) { return this.service.listTemplates(req.zapier.accountId); }
  @Post('contacts') contact(@Req() req: any, @Body() dto: ZapierContactDto) { return this.service.upsertContact(req.zapier.accountId, dto); }
  @Post('messages/template') send(@Req() req: any, @Body() dto: ZapierSendDto) { return this.service.sendTemplate(req.zapier.accountId, dto); }
}
