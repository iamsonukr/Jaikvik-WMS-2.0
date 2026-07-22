import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateRechargeOrderDto, VerifyRechargePaymentDto } from './payments.dto';
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

  // Razorpay webhook — must stay public and must read the exact raw request
  // bytes (not the parsed JSON) to verify the HMAC signature correctly.
  @Public()
  @Post('webhook/razorpay')
  webhook(@Req() req: any, @Headers('x-razorpay-signature') signature: string) {
    return this.svc.handleWebhook(req.rawBody, signature);
  }
}
