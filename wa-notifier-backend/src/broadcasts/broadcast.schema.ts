import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ── Broadcast (campaign) ──────────────────────────────────────
export type BroadcastDocument = Broadcast & Document;

@Schema({ timestamps: true })
export class Broadcast {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) clientId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) templateName: string;
  @Prop({ required: true }) languageCode: string;
  @Prop([Object]) components: any[];     // header / body / button params
  @Prop([String]) targetTags: string[];  // empty = all contacts
  @Prop({ default: 'draft' }) status: string; // draft | queued | running | done | failed
  @Prop() scheduledAt: Date;
  @Prop({ default: 0 }) totalCount: number;
  @Prop({ default: 0 }) sentCount: number;
  @Prop({ default: 0 }) deliveredCount: number;
  @Prop({ default: 0 }) readCount: number;
  @Prop({ default: 0 }) failedCount: number;

  // Pricing snapshot for this campaign — set when sending begins, from
  // PricingService.resolvePrice(). Stored here (not just on each log row)
  // so campaign-level reports don't need to re-aggregate every log entry.
  @Prop() messageCategory: string;
  @Prop() appliedUnitPrice: number;
  @Prop() appliedTaxPercent: number;
  @Prop({ default: 0 }) reservedAmount: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WalletTransaction' }) reservationTxnId: Types.ObjectId;
}

export const BroadcastSchema = SchemaFactory.createForClass(Broadcast);
BroadcastSchema.index({ clientId: 1, createdAt: -1 });
BroadcastSchema.index({ tenantId: 1 });

// ── Broadcast Log (per-message record) ───────────────────────
export type BroadcastLogDocument = BroadcastLog & Document;

@Schema({ timestamps: true })
export class BroadcastLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Broadcast', required: true }) broadcastId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) clientId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) phone: string;
  @Prop() contactName: string;
  @Prop() waMessageId: string;  // id returned by Meta
  @Prop({ default: 'queued' }) status: string; // queued | sent | delivered | read | failed
  @Prop() errorCode: string;
  @Prop() errorMessage: string;

  // Price actually applied to this specific message, captured at send time —
  // this is what makes historical reports correct even after pricing changes
  // later. Never recompute a past message's cost from current pricing rules.
  @Prop() messageCategory: string;
  @Prop() appliedUnitPrice: number;
  @Prop() appliedTaxPercent: number;
}

export const BroadcastLogSchema = SchemaFactory.createForClass(BroadcastLog);
BroadcastLogSchema.index({ broadcastId: 1 });
BroadcastLogSchema.index({ waMessageId: 1 });
