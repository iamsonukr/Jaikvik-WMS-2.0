import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MetaExpenseSnapshotDocument = MetaExpenseSnapshot & Document;

export enum MetaExpenseSource {
  MANUAL = 'manual',
  META_API = 'meta_api',
}

@Schema({ timestamps: true })
export class MetaExpenseSnapshot {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount' })
  whatsappAccountId?: Types.ObjectId;

  @Prop({ required: true })
  wabaId: string;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({ required: true, default: 0 })
  metaChargedAmount: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ enum: Object.values(MetaExpenseSource), default: MetaExpenseSource.MANUAL })
  source: MetaExpenseSource;

  @Prop()
  metaInvoiceId?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Object })
  rawMetaResponse?: Record<string, any>;

  @Prop()
  syncedAt?: Date;
}

export const MetaExpenseSnapshotSchema = SchemaFactory.createForClass(MetaExpenseSnapshot);
MetaExpenseSnapshotSchema.index({ tenantId: 1, periodStart: -1 });
MetaExpenseSnapshotSchema.index({ wabaId: 1, periodStart: -1 });
MetaExpenseSnapshotSchema.index({ wabaId: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
