import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ContactTagDocument = ContactTag & Document;

@Schema({ timestamps: true })
export class ContactTag {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true }) normalizedName: string;
  @Prop({ default: '#3b82f6' }) color: string;
  @Prop() description?: string;
  @Prop({ default: true }) isActive: boolean;
}

export const ContactTagSchema = SchemaFactory.createForClass(ContactTag);
ContactTagSchema.index({ whatsappAccountId: 1, normalizedName: 1 }, { unique: true });
ContactTagSchema.index({ tenantId: 1 });
