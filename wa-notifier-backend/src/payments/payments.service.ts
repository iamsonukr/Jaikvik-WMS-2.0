import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import PDFDocument = require('pdfkit');
import { Plan, PlanDocument, PlanStatus } from '../plans/plan.schema';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
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
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
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

  // Structured, invoice-ready view of a single payment — used by the
  // client-facing "download invoice" action. Scoped to the caller's own
  // tenant: throws NotFoundException rather than leaking that a payment
  // belonging to another tenant exists.
  async getInvoiceData(tenantId: string, paymentId: string) {
    const payment = await this.model.findOne({
      _id: toObjectId(paymentId, 'paymentId'),
      tenantId: toObjectId(tenantId, 'tenantId'),
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.buildBillingDocument(payment, tenant);

    const notes = payment.notes || {};
    const baseAmount = notes.baseAmount ?? payment.amount;
    const taxPercent = notes.taxPercent ?? 0;
    const taxAmount = notes.taxAmount ?? 0;

    return {
      invoiceNumber: `INV-${String(payment._id).slice(-8).toUpperCase()}`,
      issuedAt: (payment as any).updatedAt || (payment as any).createdAt,
      status: payment.status,
      purpose: payment.purpose,
      billTo: {
        name: tenant.name,
        gstin: tenant.taxId || null,
        email: tenant.billingEmail || tenant.contactEmail,
        addressLine1: tenant.addressLine1 || null,
        addressLine2: tenant.addressLine2 || null,
        city: tenant.city || null,
        state: tenant.state || null,
        country: tenant.country || null,
        postalCode: tenant.postalCode || null,
      },
      lineItem: {
        description: notes.planName
          ? `Subscription — ${notes.planName} (${notes.billingCycle || ''})`
          : 'WhatsApp wallet recharge',
        baseAmount,
        taxPercent,
        taxAmount,
        totalAmount: payment.amount,
      },
      currency: payment.currency,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId || null,
    };
  }

  async getInvoiceDataForStaff(paymentId: string) {
    const payment = await this.model.findById(toObjectId(paymentId, 'paymentId'));
    if (!payment) throw new NotFoundException('Payment not found');

    const tenant = await this.tenantModel.findById(payment.tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.buildBillingDocument(payment, tenant);
  }

  async getInvoicePdf(tenantId: string, paymentId: string) {
    const invoice = await this.getInvoiceData(tenantId, paymentId);
    return this.renderInvoicePdf(invoice);
  }

  async getInvoicePdfForStaff(paymentId: string) {
    const invoice = await this.getInvoiceDataForStaff(paymentId);
    return this.renderInvoicePdf(invoice);
  }

  private buildBillingDocument(payment: RazorpayPaymentDocument, tenant: TenantDocument) {
    const notes = payment.notes || {};
    const baseAmount = notes.baseAmount ?? payment.amount;
    const taxPercent = notes.taxPercent ?? 0;
    const taxAmount = notes.taxAmount ?? 0;
    const isSubscription = payment.purpose === PaymentPurpose.SUBSCRIPTION;
    const suffix = String(payment._id).slice(-8).toUpperCase();
    const invoiceNumber = `${isSubscription ? 'GST-SUB' : 'WRC'}-${suffix}`;

    return {
      invoiceNumber,
      documentType: isSubscription ? 'subscription_invoice' : 'wallet_recharge_receipt',
      documentTitle: isSubscription ? 'GST Subscription Invoice' : 'Wallet Recharge Receipt',
      fileName: `${invoiceNumber}.pdf`,
      issuedAt: (payment as any).updatedAt || (payment as any).createdAt,
      status: payment.status,
      purpose: payment.purpose,
      seller: {
        name: this.config.get<string>('BILLING_COMPANY_NAME') || 'Jaikvik WhatsApp Management System',
        gstin: this.config.get<string>('BILLING_GSTIN') || null,
        email: this.config.get<string>('BILLING_EMAIL') || null,
        address: this.config.get<string>('BILLING_ADDRESS') || null,
      },
      billTo: {
        name: tenant.name,
        gstin: tenant.taxId || null,
        email: tenant.billingEmail || tenant.contactEmail,
        addressLine1: tenant.addressLine1 || null,
        addressLine2: tenant.addressLine2 || null,
        city: tenant.city || null,
        state: tenant.state || null,
        country: tenant.country || null,
        postalCode: tenant.postalCode || null,
      },
      lineItem: {
        description: notes.planName
          ? `Subscription - ${notes.planName} (${notes.billingCycle || ''})`
          : 'WhatsApp wallet recharge',
        baseAmount,
        taxPercent,
        taxAmount,
        totalAmount: payment.amount,
      },
      currency: payment.currency,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId || null,
    };
  }

  private renderInvoicePdf(invoice: any): Promise<{ buffer: Buffer; filename: string }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename: invoice.fileName || `${invoice.invoiceNumber}.pdf` }));
      doc.on('error', reject);

      const line = invoice.lineItem || {};
      const billTo = invoice.billTo || {};
      const seller = invoice.seller || {};
      const currency = invoice.currency || 'INR';
      const amount = (value: number) => `${currency} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const date = (value: string | Date) => value ? new Date(value).toLocaleDateString('en-IN') : '-';
      const address = [
        billTo.addressLine1,
        billTo.addressLine2,
        [billTo.city, billTo.state, billTo.postalCode].filter(Boolean).join(', '),
        billTo.country,
      ].filter(Boolean).join('\n');

      doc.fontSize(10).fillColor('#6b7280').text(seller.name || 'Jaikvik WMS', 48, 44);
      if (seller.gstin) doc.text(`GSTIN: ${seller.gstin}`);
      if (seller.email) doc.text(seller.email);
      if (seller.address) doc.text(seller.address);

      doc.fillColor('#111827').fontSize(22).text(invoice.documentTitle || 'Invoice', 48, 110);
      doc.fontSize(10).fillColor('#6b7280').text(`Document No: ${invoice.invoiceNumber}`, 48, 140);
      doc.text(`Issued: ${date(invoice.issuedAt)}`, 48, 156);
      doc.text(`Status: ${String(invoice.status || '').toUpperCase()}`, 48, 172);

      doc.roundedRect(360, 110, 180, 74, 6).strokeColor('#d1d5db').stroke();
      doc.fillColor('#6b7280').fontSize(9).text('RAZORPAY ORDER', 374, 126);
      doc.fillColor('#111827').fontSize(9).text(invoice.razorpayOrderId || '-', 374, 143, { width: 150 });
      doc.fillColor('#6b7280').text('PAYMENT ID', 374, 160);
      doc.fillColor('#111827').text(invoice.razorpayPaymentId || '-', 374, 174, { width: 150 });

      doc.fillColor('#6b7280').fontSize(9).text('BILLED TO', 48, 220);
      doc.fillColor('#111827').fontSize(12).text(billTo.name || '-', 48, 238);
      if (billTo.gstin) doc.fontSize(10).text(`GSTIN: ${billTo.gstin}`);
      if (address) doc.fontSize(10).text(address, { width: 240 });
      if (billTo.email) doc.fontSize(10).text(billTo.email);

      const tableTop = 330;
      doc.strokeColor('#d1d5db').moveTo(48, tableTop).lineTo(540, tableTop).stroke();
      doc.fillColor('#6b7280').fontSize(9).text('DESCRIPTION', 54, tableTop + 12);
      doc.text('AMOUNT', 430, tableTop + 12, { width: 100, align: 'right' });
      doc.strokeColor('#d1d5db').moveTo(48, tableTop + 34).lineTo(540, tableTop + 34).stroke();

      doc.fillColor('#111827').fontSize(11).text(line.description || '-', 54, tableTop + 50, { width: 320 });
      doc.text(amount(line.baseAmount), 430, tableTop + 50, { width: 100, align: 'right' });
      doc.strokeColor('#e5e7eb').moveTo(48, tableTop + 86).lineTo(540, tableTop + 86).stroke();

      const totalsX = 340;
      const totalsY = tableTop + 112;
      doc.fontSize(10).fillColor('#6b7280').text('Subtotal', totalsX, totalsY);
      doc.fillColor('#111827').text(amount(line.baseAmount), 430, totalsY, { width: 100, align: 'right' });
      doc.fillColor('#6b7280').text(`GST / Tax (${Number(line.taxPercent || 0).toLocaleString('en-IN')}%)`, totalsX, totalsY + 22);
      doc.fillColor('#111827').text(amount(line.taxAmount), 430, totalsY + 22, { width: 100, align: 'right' });
      doc.strokeColor('#111827').moveTo(totalsX, totalsY + 46).lineTo(540, totalsY + 46).stroke();
      doc.fontSize(12).fillColor('#111827').text('Total', totalsX, totalsY + 58);
      doc.text(amount(line.totalAmount), 430, totalsY + 58, { width: 100, align: 'right' });

      doc.fillColor('#6b7280').fontSize(9).text(
        invoice.documentType === 'wallet_recharge_receipt'
          ? 'Receipt for wallet recharge credited to the client wallet after successful payment capture.'
          : 'Invoice for subscription purchase based on the plan and billing-cycle snapshot captured at payment time.',
        48,
        735,
        { width: 492, align: 'center' },
      );

      doc.end();
    });
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
