import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RazorpayPayment, RazorpayPaymentSchema } from './razorpay-payment.schema';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RazorpayPayment.name, schema: RazorpayPaymentSchema }]),
    WalletModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService, MongooseModule],
})
export class PaymentsModule {}
