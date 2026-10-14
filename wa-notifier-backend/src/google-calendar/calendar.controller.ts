import { Body, CanActivate, Controller, Delete, ExecutionContext, ForbiddenException, Get, Injectable, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { CalendarGoogleService } from './calendar-google.service';
import { CalendarService } from './calendar.service';
import { CalendarRecipientDto, CalendarSettingsDto } from './calendar.dto';

@Injectable()
export class CalendarAccountGuard implements CanActivate {
  constructor(private accounts: WhatsAppAccountsService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const id = req.params.whatsappAccountId;
    if (!req.user || !Types.ObjectId.isValid(id)) throw new ForbiddenException('Invalid account.');
    const account = await this.accounts.findOne(id);
    if (!account || !account.isActive || account.isRemoved) throw new ForbiddenException('WhatsApp account is inactive.');
    const platform = ['admin', 'master'].includes(req.user.role);
    if (!platform && (req.user.role !== 'client_owner' || String(account.tenantId) !== String(req.user.tenantId))) {
      throw new ForbiddenException('Only the client owner or platform staff can manage this integration.');
    }
    return true;
  }
}

@Controller('google-calendar/oauth')
export class CalendarOAuthController {
  constructor(private google: CalendarGoogleService) {}
  @Public() @Get('callback') callback(@Req() req: Request, @Res() res: Response) { return this.google.callback(req, res); }
}

@Controller('google-calendar/:whatsappAccountId')
@UseGuards(CalendarAccountGuard)
export class CalendarController {
  constructor(private calendar: CalendarService, private google: CalendarGoogleService) {}
  @Get() status(@Param('whatsappAccountId') id: string) { return this.calendar.status(id); }
  @Post('connect') connect(@Param('whatsappAccountId') id: string, @Res({ passthrough: true }) res: Response) { return this.google.start(id, res); }
  @Delete('connection') disconnect(@Param('whatsappAccountId') id: string) { return this.google.disconnect(id); }
  @Get('calendars') calendars(@Param('whatsappAccountId') id: string) { return this.calendar.calendars(id); }
  @Get('events') events(@Param('whatsappAccountId') id: string, @Query('calendarId') calendarId: string) { return this.calendar.events(id, calendarId); }
  @Post('settings') save(@Param('whatsappAccountId') id: string, @Body() dto: CalendarSettingsDto) { return this.calendar.save(id, dto); }
  @Post('recipient') recipient(@Param('whatsappAccountId') id: string, @Body() dto: CalendarRecipientDto) { return this.calendar.recipient(id, dto); }
}


