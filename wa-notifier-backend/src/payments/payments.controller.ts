import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreateRechargeOrderDto, CreateSubscriptionOrderDto, VerifyRechargePaymentDto } from './payments.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  findAll(@Query('tenantId') tenantId?: string) {
    return tenantId ? this.svc.findByTenant(tenantId) : this.svc.findAll();
  }

  // Client-facing: their own payment history (wallet recharges + subscription
  // payments), resolved from the JWT — never a client-supplied tenantId.
  @Get('me')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myPayments(@CurrentTenant() tenantId: string) {
    return this.svc.findByTenant(tenantId);
  }

  @Get('me/:id/invoice')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  myInvoice(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.svc.getInvoiceData(tenantId, id);
  }

  @Get('me/:id/invoice.pdf')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  async myInvoicePdf(@CurrentTenant() tenantId: string, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.svc.getInvoicePdf(tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    return res.send(pdf.buffer);
  }

  @Get(':id/invoice')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  invoiceForStaff(@Param('id') id: string) {
    return this.svc.getInvoiceDataForStaff(id);
  }

  @Get(':id/invoice.pdf')
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  async invoicePdfForStaff(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.svc.getInvoicePdfForStaff(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    return res.send(pdf.buffer);
  }

  @Post('wallet-recharge/order')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  createOrder(@CurrentTenant() tenantId: string, @Body() dto: CreateRechargeOrderDto) {
    return this.svc.createRechargeOrder(tenantId, dto.amount);
  }

  @Post('wallet-recharge/verify')
  @Roles(UserRole.CLIENT_OWNER, UserRole.CLIENT_USER)
  verify(@Body() dto: VerifyRechargePaymentDto) {
    return this.svc.verifyRechargePayment(dto);
  }

  @Post('subscription/order')
  @Roles(UserRole.CLIENT_OWNER)
  createSubscriptionOrder(@CurrentTenant() tenantId: string, @Body() dto: CreateSubscriptionOrderDto) {
    return this.svc.createSubscriptionOrder(tenantId, dto.planId, dto.billingCycle);
  }

  @Post('subscription/verify')
  @Roles(UserRole.CLIENT_OWNER)
  verifySubscription(@Body() dto: VerifyRechargePaymentDto) {
    return this.svc.verifySubscriptionPayment(dto);
  }

  // Razorpay webhook — must stay public and must read the exact raw request
  // bytes (not the parsed JSON) to verify the HMAC signature correctly.
  @Public()
  @Post('webhook/razorpay')
  webhook(@Req() req: any, @Headers('x-razorpay-signature') signature: string) {
    return this.svc.handleWebhook(req.rawBody, signature);
  }
}
