import { Body, CanActivate, Controller, Delete, ExecutionContext, ForbiddenException, Get, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Public } from '../common/decorators/public.decorator';
import { CalendlyService } from './calendly.service';
import { CalendlyConnectDto, CalendlySettingsDto } from './calendly.dto';

@Injectable()
export class CalendlyAccountGuard implements CanActivate {
  constructor(private service: CalendlyService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.user || !Types.ObjectId.isValid(req.params.whatsappAccountId)) throw new ForbiddenException('Invalid account.');
    const account = await this.service.activeAccount(req.params.whatsappAccountId);
    if (!['admin', 'master'].includes(req.user.role) && (req.user.role !== 'client_owner' || String(req.user.tenantId) !== String(account.tenantId))) {
      throw new ForbiddenException('Only the client owner or platform staff can manage Calendly.');
    }
    context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    return true;
  }
}
@Controller('integrations/calendly/:whatsappAccountId')
@UseGuards(CalendlyAccountGuard)
export class CalendlyController {
  constructor(private service: CalendlyService) {}
  @Get() status(@Param('whatsappAccountId') id: string) { return this.service.status(id); }
  @Post('connect') connect(@Param('whatsappAccountId') id: string, @Body() dto: CalendlyConnectDto) { return this.service.connect(id, dto.token); }
  @Delete('connection') disconnect(@Param('whatsappAccountId') id: string) { return this.service.disconnect(id); }
  @Post('settings') settings(@Param('whatsappAccountId') id: string, @Body() dto: CalendlySettingsDto) { return this.service.save(id, dto); }
}
@Controller('webhooks/calendly')
export class CalendlyWebhookController {
  constructor(private service: CalendlyService) {}
  @Public() @Post(':whatsappAccountId/:revision') receive(@Param('whatsappAccountId') id: string, @Param('revision') revision: string, @Req() req: any) {
    return this.service.receive(id, revision, req.rawBody, req.headers['calendly-webhook-signature'], req.body);
  }
}
