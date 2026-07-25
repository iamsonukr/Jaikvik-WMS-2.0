import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type RazorpayPaymentDocument = RazorpayPayment & Document;

export enum PaymentPurpose {
  WALLET_RECHARGE = 'wallet_recharge',
  SUBSCRIPTION = 'subscription',
}

export enum PaymentStatus {
  CREATED = 'created',
  PAID = 'paid',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class RazorpayPayment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(PaymentPurpose) }) purpose: PaymentPurpose;

  @Prop({ required: true, unique: true }) razorpayOrderId: string;
  @Prop({ unique: true, sparse: true }) razorpayPaymentId: string;
  @Prop() razorpaySignature: string;

  @Prop({ required: true }) amount: number; // in the base currency unit (e.g. rupees, not paise)
  @Prop({ default: 'INR' }) currency: string;

  @Prop({ required: true, enum: Object.values(PaymentStatus), default: PaymentStatus.CREATED })
  status: PaymentStatus;

  // Set once the wallet has actually been credited for this payment — the
  // presence of this field is what makes credit-on-webhook idempotent.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WalletTransaction', default: null })
  walletTransactionId: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Subscription', default: null })
  subscriptionId: Types.ObjectId | null;

  @Prop({ type: Object }) notes: Record<string, any>;
}

export const RazorpayPaymentSchema = SchemaFactory.createForClass(RazorpayPayment);
RazorpayPaymentSchema.index({ tenantId: 1, createdAt: -1 });
