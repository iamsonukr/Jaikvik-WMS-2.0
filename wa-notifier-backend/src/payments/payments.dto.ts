import { IsNumber, IsString, Min } from 'class-validator';

export class CreateRechargeOrderDto {
  @IsNumber() @Min(1) amount: number; // rupees
}

export class VerifyRechargePaymentDto {
  @IsString() razorpay_order_id: string;
  @IsString() razorpay_payment_id: string;
  @IsString() razorpay_signature: string;
}
