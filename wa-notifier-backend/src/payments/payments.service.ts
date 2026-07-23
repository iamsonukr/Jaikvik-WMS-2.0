import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  RazorpayPayment,
  RazorpayPaymentDocument,
  PaymentPurpose,
  PaymentStatus,
} from './razorpay-payment.schema';
import { WalletService } from '../wallet/wallet.service';
import { toObjectId } from '../common/mongo-id';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(RazorpayPayment.name) private model: Model<RazorpayPaymentDocument>,
    private config: ConfigService,
    private wallet: WalletService,
  ) {}

  findAll() {
    return this.model.find().sort({ createdAt: -1 }).populate('tenantId', 'name');
  }

  findByTenant(tenantId: string) {
    return this.model.find({ tenantId: toObjectId(tenantId, 'tenantId') }).sort({ createdAt: -1 });
  }

  private get keyId() {
    return this.config.get<string>('RAZORPAY_KEY_ID');
  }
  private get keySecret() {
    return this.config.get<string>('RAZORPAY_KEY_SECRET');
  }
  private get webhookSecret() {
    return this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
  }

  async createRechargeOrder(tenantId: string, amount: number) {
    if (!this.keyId || !this.keySecret) {
      throw new BadRequestException(
        'Razorpay is not configured on this server (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)',
      );
    }

    const receipt = this.createReceipt();
    if (receipt.length > 40) {
      throw new BadRequestException(`Generated Razorpay receipt is too long (${receipt.length}/40)`);
    }
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay expects paise
        currency: 'INR',
        receipt,
        notes: { tenantId, purpose: 'wallet_recharge' },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(`Razorpay order creation failed for receipt ${receipt} (${receipt.length}/40): ${body}`);
    }
    const order: any = await response.json();

    await this.model.create({
      tenantId: toObjectId(tenantId, 'tenantId'),
      purpose: PaymentPurpose.WALLET_RECHARGE,
      razorpayOrderId: order.id,
      amount,
      currency: order.currency,
      status: PaymentStatus.CREATED,
    });

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: this.keyId };
  }

  /**
   * Called from the frontend's Checkout success callback. Verifies the
   * signature, then credits the wallet. The webhook (below) is the actual
   * source of truth — this path exists purely so the user sees an instant
   * result instead of waiting for the webhook round-trip. Whichever of the
   * two runs first performs the credit; the other becomes a safe no-op via
   * the unique index on razorpayPaymentId. Never credit from this callback
   * alone without the webhook also being configured in production.
   */
  async verifyRechargePayment(dto: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const expected = `${dto.razorpay_order_id}|${dto.razorpay_payment_id}`;
    if (!this.keySecret || !this.safeCompare(this.sign(expected, this.keySecret), dto.razorpay_signature)) {
      throw new UnauthorizedException('Invalid Razorpay payment signature');
    }
    return this.creditFromPayment(dto.razorpay_order_id, dto.razorpay_payment_id, dto.razorpay_signature);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.webhookSecret) {
      throw new BadRequestException('RAZORPAY_WEBHOOK_SECRET is not configured');
    }
    const expected = this.sign(rawBody.toString('utf8'), this.webhookSecret);
    if (!signature || !this.safeCompare(expected, signature)) {
      throw new UnauthorizedException('Invalid Razorpay webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload.event;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      if (paymentEntity?.order_id && paymentEntity?.id) {
        await this.creditFromPayment(paymentEntity.order_id, paymentEntity.id, null);
      }
    }
    return { received: true };
  }

  // Idempotent — safe to call from both the checkout callback and the
  // webhook, and safe if the webhook fires more than once. Credits the
  // wallet exactly once per razorpayOrderId (guarded by
  // payment.walletTransactionId, and further backstopped by the unique
  // index on WalletTransaction.razorpayPaymentId).
  private async creditFromPayment(orderId: string, paymentId: string, signature: string | null) {
    const record = await this.model.findOne({ razorpayOrderId: orderId });
    if (!record) throw new BadRequestException('No matching payment order found for this Razorpay order ID');

    if (record.walletTransactionId) {
      return { alreadyCredited: true, payment: record };
    }

    const txn = await this.wallet.recharge(String(record.tenantId), record.amount, {
      description: 'Wallet recharge via Razorpay',
      referenceId: orderId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
    });

    record.razorpayPaymentId = paymentId;
    if (signature) record.razorpaySignature = signature;
    record.status = PaymentStatus.PAID;
    record.walletTransactionId = txn._id as any;
    await record.save();

    return { alreadyCredited: false, payment: record, transaction: txn };
  }

  private sign(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  private createReceipt(): string {
    return `wr_${crypto.randomBytes(12).toString('hex')}`;
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
