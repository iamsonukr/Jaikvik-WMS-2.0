import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Plan', required: true }) planId: Types.ObjectId;

  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;

  @Prop({ required: true, enum: Object.values(SubscriptionStatus), default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  // Snapshot of the plan's commercial terms at the moment this subscription
  // was created/renewed — so a later price change on the Plan itself doesn't
  // retroactively alter what this tenant is being billed or what their
  // historical invoices said.
  @Prop({ required: true }) priceSnapshot: number;
  @Prop({ required: true }) billingCycleSnapshot: string;
  @Prop({ default: 'INR' }) currency: string;

  @Prop({ default: true }) autoRenew: boolean;
  @Prop() cancelledAt: Date;
  @Prop() cancelReason: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ tenantId: 1, status: 1 });
