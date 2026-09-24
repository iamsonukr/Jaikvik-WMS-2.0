import { Body, CanActivate, Controller, Delete, ExecutionContext, ForbiddenException, Get, Injectable, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { SheetsGoogleService } from './sheets-google.service';
import { SheetsService } from './sheets.service';
import { SheetSelectionDto, SheetSettingsDto } from './sheets.dto';

@Injectable()
export class SheetsAccountGuard implements CanActivate {
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

@Controller('google-sheets/oauth')
export class SheetsOAuthController {
  constructor(private google: SheetsGoogleService) {}
  @Public() @Get('callback') callback(@Req() req: Request, @Res() res: Response) { return this.google.callback(req, res); }
}

@Controller('google-sheets/:whatsappAccountId')
@UseGuards(SheetsAccountGuard)
export class SheetsController {
  constructor(private sheets: SheetsService, private google: SheetsGoogleService) {}
  @Get() status(@Param('whatsappAccountId') id: string) { return this.sheets.status(id); }
  @Post('connect') connect(@Param('whatsappAccountId') id: string, @Res({ passthrough: true }) res: Response) { return this.google.start(id, res); }
  @Delete('connection') disconnect(@Param('whatsappAccountId') id: string) { return this.google.disconnect(id); }
  @Get('spreadsheet') inspect(@Param('whatsappAccountId') id: string, @Query('spreadsheetId') sid: string) { return this.sheets.inspect(id, sid); }
  @Post('preview') preview(@Param('whatsappAccountId') id: string, @Body() dto: SheetSelectionDto) { return this.sheets.preview(id, dto); }
  @Post('settings') save(@Param('whatsappAccountId') id: string, @Body() dto: SheetSettingsDto) { return this.sheets.save(id, dto); }
  @Post('sync') sync(@Param('whatsappAccountId') id: string) { return this.sheets.sync(id); }
}
