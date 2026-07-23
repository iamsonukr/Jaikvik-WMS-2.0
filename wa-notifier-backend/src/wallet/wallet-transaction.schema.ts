import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type WalletTransactionDocument = WalletTransaction & Document;

export enum WalletTransactionType {
  RECHARGE = 'recharge',
  MESSAGE_DEBIT = 'message_debit',
  CAMPAIGN_RESERVATION = 'campaign_reservation',
  REFUND = 'refund',
  MANUAL_CREDIT = 'manual_credit',
  MANUAL_DEBIT = 'manual_debit',
  REVERSAL = 'reversal',
}

export enum WalletTransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

@Schema({ timestamps: true })
export class WalletTransaction {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(WalletTransactionType) }) type: WalletTransactionType;

  @Prop({ default: 0 }) creditAmount: number;
  @Prop({ default: 0 }) debitAmount: number;
  @Prop({ required: true }) balanceBefore: number;
  @Prop({ required: true }) balanceAfter: number;

  @Prop() description: string;
  @Prop() referenceId: string;

  @Prop() razorpayOrderId: string;
  @Prop() razorpayPaymentId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Broadcast' }) campaignId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) messageId: Types.ObjectId;
  @Prop() messageCategory: string;
  @Prop() appliedUnitPrice: number;
  @Prop({ default: 0 }) tax: number;

  @Prop({ required: true, enum: Object.values(WalletTransactionStatus), default: WalletTransactionStatus.COMPLETED })
  status: WalletTransactionStatus;

  // Required whenever an admin manually credits/debits a wallet — enforced
  // in the service layer, not just here, since this field is optional for
  // system-generated transaction types (recharge, message_debit, etc.).
  @Prop() reason: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' }) actorUserId: Types.ObjectId;
}

export const WalletTransactionSchema = SchemaFactory.createForClass(WalletTransaction);
WalletTransactionSchema.index({ tenantId: 1, createdAt: -1 });
WalletTransactionSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
