import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Plan, PlanDocument, PlanStatus } from '../plans/plan.schema';
import { BillingCycle } from '../common/enums/billing-cycle.enum';
import {
  RazorpayPayment,
  RazorpayPaymentDocument,
  PaymentPurpose,
  PaymentStatus,
} from './razorpay-payment.schema';
import { WalletService } from '../wallet/wallet.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { toObjectId } from '../common/mongo-id';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(RazorpayPayment.name) private model: Model<RazorpayPaymentDocument>,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    private config: ConfigService,
    private wallet: WalletService,
    private subscriptions: SubscriptionsService,
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
      this.throwRazorpayNotConfigured();
    }

    const order = await this.createRazorpayOrder(amount, 'INR', { tenantId, purpose: PaymentPurpose.WALLET_RECHARGE });

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

  async createSubscriptionOrder(tenantId: string, planId: string, selectedBillingCycle?: string) {
    if (!this.keyId || !this.keySecret) {
      this.throwRazorpayNotConfigured();
    }

    const plan = await this.planModel.findOne({ _id: toObjectId(planId, 'planId'), status: PlanStatus.ACTIVE });
    if (!plan) throw new BadRequestException('Plan is not available for purchase');
    const billingCycle = selectedBillingCycle || BillingCycle.QUARTERLY;
    if (![BillingCycle.MONTHLY, BillingCycle.QUARTERLY, BillingCycle.YEARLY].includes(billingCycle as BillingCycle)) {
      throw new BadRequestException('Choose a valid billing cycle for this plan');
    }
    if (plan.price === null || plan.price === undefined) {
      throw new BadRequestException('This plan cannot be purchased online. Please contact sales.');
    }

    const baseAmount = this.priceForCycle(plan, billingCycle);
    const taxAmount = Number(((baseAmount * Number(plan.taxPercent || 0)) / 100).toFixed(2));
    const amount = Number((baseAmount + taxAmount).toFixed(2));
    if (amount <= 0) throw new BadRequestException('Plan price must be greater than zero');

    const order = await this.createRazorpayOrder(amount, plan.currency || 'INR', {
      tenantId,
      planId,
      billingCycle,
      purpose: PaymentPurpose.SUBSCRIPTION,
    });

    await this.model.create({
      tenantId: toObjectId(tenantId, 'tenantId'),
      purpose: PaymentPurpose.SUBSCRIPTION,
      razorpayOrderId: order.id,
      amount,
      currency: order.currency,
      status: PaymentStatus.CREATED,
      notes: {
        planId,
        planName: plan.name,
        billingCycle,
        baseAmount,
        taxPercent: plan.taxPercent || 0,
        taxAmount,
      },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.keyId,
      plan: {
        _id: plan._id,
        name: plan.name,
        billingCycle,
        baseAmount,
        taxPercent: plan.taxPercent || 0,
        taxAmount,
        totalAmount: amount,
      },
    };
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
    this.verifyCheckoutSignature(dto);
    return this.applyPaidOrder(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
      PaymentPurpose.WALLET_RECHARGE,
    );
  }

  async verifySubscriptionPayment(dto: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    this.verifyCheckoutSignature(dto);
    return this.applyPaidOrder(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
      PaymentPurpose.SUBSCRIPTION,
    );
  }

  private verifyCheckoutSignature(dto: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const expected = `${dto.razorpay_order_id}|${dto.razorpay_payment_id}`;
    if (!this.keySecret || !this.safeCompare(this.sign(expected, this.keySecret), dto.razorpay_signature)) {
      throw new UnauthorizedException('Invalid Razorpay payment signature');
    }
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
        await this.applyPaidOrder(paymentEntity.order_id, paymentEntity.id, null);
      }
    }
    return { received: true };
  }

  // Idempotent — safe to call from both the checkout callback and the
  // webhook, and safe if the webhook fires more than once. Credits the
  // wallet exactly once per razorpayOrderId (guarded by
  // payment.walletTransactionId, and further backstopped by the unique
  // index on WalletTransaction.razorpayPaymentId).
  private async applyPaidOrder(
    orderId: string,
    paymentId: string,
    signature: string | null,
    expectedPurpose?: PaymentPurpose,
  ) {
    const record = await this.model.findOne({ razorpayOrderId: orderId });
    if (!record) throw new BadRequestException('No matching payment order found for this Razorpay order ID');
    if (expectedPurpose && record.purpose !== expectedPurpose) {
      throw new BadRequestException('Payment order purpose does not match this verification endpoint');
    }

    if (record.purpose === PaymentPurpose.SUBSCRIPTION) {
      return this.activateSubscriptionFromPayment(record, paymentId, signature);
    }

    return this.creditWalletFromPayment(record, paymentId, signature);
  }

  private async creditWalletFromPayment(record: RazorpayPaymentDocument, paymentId: string, signature: string | null) {
    if (record.walletTransactionId) {
      return { alreadyCredited: true, payment: record };
    }

    const txn = await this.wallet.recharge(String(record.tenantId), record.amount, {
      description: 'Wallet recharge via Razorpay',
      referenceId: record.razorpayOrderId,
      razorpayOrderId: record.razorpayOrderId,
      razorpayPaymentId: paymentId,
    });

    record.razorpayPaymentId = paymentId;
    if (signature) record.razorpaySignature = signature;
    record.status = PaymentStatus.PAID;
    record.walletTransactionId = txn._id as any;
    await record.save();

    return { alreadyCredited: false, payment: record, transaction: txn };
  }

  private async activateSubscriptionFromPayment(record: RazorpayPaymentDocument, paymentId: string, signature: string | null) {
    if (record.subscriptionId) {
      return { alreadyApplied: true, payment: record };
    }

    const planId = record.notes?.planId;
    if (!planId) throw new BadRequestException('No plan is attached to this subscription payment');

    const subscription = await this.subscriptions.assign({
      tenantId: String(record.tenantId),
      planId,
      billingCycle: record.notes?.billingCycle,
    });

    record.razorpayPaymentId = paymentId;
    if (signature) record.razorpaySignature = signature;
    record.status = PaymentStatus.PAID;
    record.subscriptionId = subscription._id as any;
    record.notes = {
      ...(record.notes || {}),
      subscriptionId: String(subscription._id),
    };
    await record.save();

    return { alreadyApplied: false, payment: record, subscription };
  }

  private async createRazorpayOrder(amount: number, currency: string, notes: Record<string, any>) {
    const receipt = this.createReceipt(notes.purpose === PaymentPurpose.SUBSCRIPTION ? 'sub' : 'wr');
    if (receipt.length > 40) {
      throw new BadRequestException(`Generated Razorpay receipt is too long (${receipt.length}/40)`);
    }
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay expects paise
        currency,
        receipt,
        notes,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(`Razorpay order creation failed for receipt ${receipt} (${receipt.length}/40): ${body}`);
    }
    return response.json();
  }

  private throwRazorpayNotConfigured(): never {
    throw new BadRequestException(
      'Razorpay is not configured on this server (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)',
    );
  }

  private priceForCycle(plan: PlanDocument, billingCycle: string): number {
    const price = plan.price as any;
    const raw = typeof price === 'number' ? price : price?.[billingCycle];
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(`Price is not configured for ${billingCycle} billing on this plan`);
    }
    return amount;
  }

  private sign(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  private createReceipt(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
