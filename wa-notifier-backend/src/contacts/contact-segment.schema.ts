import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ContactSegmentDocument = ContactSegment & Document;

@Schema({ timestamps: true })
export class ContactSegment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: 'any', enum: ['any', 'all'] }) matchMode: 'any' | 'all';
  @Prop() description?: string;
  @Prop({ default: true }) isActive: boolean;
}

export const ContactSegmentSchema = SchemaFactory.createForClass(ContactSegment);
ContactSegmentSchema.index({ whatsappAccountId: 1, name: 1 }, { unique: true });
ContactSegmentSchema.index({ tenantId: 1, createdAt: -1 });
