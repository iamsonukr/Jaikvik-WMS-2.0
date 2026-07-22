import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) actorUserId: Types.ObjectId;
  @Prop({ required: true }) actorRole: string;

  // e.g. 'tenant.suspend', 'wallet.manual_credit', 'plan.update'
  @Prop({ required: true }) action: string;

  // e.g. 'Tenant', 'Wallet', 'Plan'
  @Prop({ required: true }) targetType: string;
  @Prop({ type: Types.ObjectId }) targetId: Types.ObjectId;

  @Prop() reason: string;
  @Prop({ type: Object }) metadata: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ createdAt: -1 });
