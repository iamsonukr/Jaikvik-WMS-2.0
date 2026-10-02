import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as M, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ZapierConnection {
  @Prop({ type: M.Types.ObjectId, unique: true, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ select: false }) keyHash: string;
  @Prop() keyHint: string;
  @Prop({ default: false }) enabled: boolean;
  @Prop() lastUsedAt: Date;
  @Prop() rateWindow: number;
  @Prop({ default: 0 }) requestCount: number;
}
export const ZapierConnectionSchema = SchemaFactory.createForClass(ZapierConnection);
ZapierConnectionSchema.index({ keyHash: 1 }, { unique: true, sparse: true });

@Schema({ timestamps: true })
export class ZapierHook {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) event: string;
  @Prop({ required: true, select: false }) url: string;
  @Prop({ default: true }) enabled: boolean;
  @Prop({ default: 0 }) revision: number;
  @Prop({ required: true }) startsAt: Date;
  @Prop({ type: Object, default: {} }) cursors: Record<string, any>;
  @Prop() lastError: string;
  @Prop() lastScannedAt: Date;
  @Prop() scanLockOwner: string;
  @Prop() scanLockedUntil: Date;
}
export const ZapierHookSchema = SchemaFactory.createForClass(ZapierHook);
ZapierHookSchema.index({ whatsappAccountId: 1 });

@Schema({ timestamps: true })
export class ZapierDelivery {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: M.Types.ObjectId, required: true }) hookId: Types.ObjectId;
  @Prop({ required: true }) hookRevision: number;
  @Prop({ required: true }) eventId: string;
  @Prop({ type: Object, required: true }) payload: Record<string, any>;
  @Prop({ default: 'pending' }) status: string;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ default: Date.now }) nextAttemptAt: Date;
  @Prop() lockedUntil: Date;
  @Prop() lockOwner: string;
  @Prop() deliveredAt: Date;
  @Prop() lastError: string;
  @Prop() responseStatus: number;
}
export const ZapierDeliverySchema = SchemaFactory.createForClass(ZapierDelivery);
ZapierDeliverySchema.index({ hookId: 1, eventId: 1 }, { unique: true });
ZapierDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
ZapierDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

@Schema({ timestamps: true })
export class ZapierAction {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true }) requestId: string;
  @Prop({ required: true }) kind: string;
  @Prop({ required: true }) fingerprint: string;
  @Prop({ default: 'processing' }) status: string;
  @Prop({ type: Object }) result: Record<string, any>;
  @Prop() error: string;
}
export const ZapierActionSchema = SchemaFactory.createForClass(ZapierAction);
ZapierActionSchema.index({ whatsappAccountId: 1, requestId: 1 }, { unique: true });
