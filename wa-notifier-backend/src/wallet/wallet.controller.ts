import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { WalletService } from './wallet.service';
import { LedgerQueryDto, ManualAdjustmentDto, ReverseWalletTransactionDto } from './wallet.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('wallet')
export class WalletController {
  constructor(private svc: WalletService) {}

  // Client-facing — tenant resolved from the JWT, never a client-supplied ID.
  @Get('me')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myBalance(@CurrentTenant() tenantId: string) {
    return this.svc.getBalance(tenantId);
  }

  @Get('me/transactions')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myLedger(@CurrentTenant() tenantId: string, @Query() query: LedgerQueryDto) {
    return this.svc.getLedger(tenantId, query);
  }

  // Platform-wide revenue snapshot for the Admin dashboard charts. Placed
  // before ':tenantId' so Nest doesn't try to match 'summary' as an id.
  @Get('admin/summary')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  platformSummary() {
    return this.svc.platformSummary();
  }

  // Staff view of any tenant's wallet.
  @Get(':tenantId')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  balance(@Param('tenantId') tenantId: string) {
    return this.svc.getBalance(tenantId);
  }

  @Get(':tenantId/transactions')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  ledger(@Param('tenantId') tenantId: string, @Query() query: LedgerQueryDto) {
    return this.svc.getLedger(tenantId, query);
  }

  @Get(':tenantId/transactions/export.csv')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  async ledgerCsv(@Param('tenantId') tenantId: string, @Query() query: LedgerQueryDto, @Res() res: Response) {
    const { filename, csv } = await this.svc.exportLedgerCsv(tenantId, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }

  @Get(':tenantId/transactions/export.pdf')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  async ledgerPdf(@Param('tenantId') tenantId: string, @Query() query: LedgerQueryDto, @Res() res: Response) {
    const pdf = await this.svc.exportLedgerPdf(tenantId, query, false);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    return res.send(pdf.buffer);
  }

  @Get(':tenantId/statement.pdf')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  async statementPdf(@Param('tenantId') tenantId: string, @Query() query: LedgerQueryDto, @Res() res: Response) {
    const pdf = await this.svc.exportLedgerPdf(tenantId, query, true);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    return res.send(pdf.buffer);
  }

  @Post(':tenantId/transactions/:transactionId/reverse')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  reverseTransaction(
    @Param('tenantId') tenantId: string,
    @Param('transactionId') transactionId: string,
    @Body() dto: ReverseWalletTransactionDto,
    @Req() req: any,
  ) {
    return this.svc.reverseTransaction(tenantId, transactionId, dto.action, dto.reason, req.user._id, req.user.role);
  }

  @Post(':tenantId/adjust')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  adjust(@Param('tenantId') tenantId: string, @Body() dto: ManualAdjustmentDto, @Req() req: any) {
    return this.svc.manualAdjust(tenantId, dto.direction, dto.amount, dto.reason, req.user._id, req.user.role);
  }
}
