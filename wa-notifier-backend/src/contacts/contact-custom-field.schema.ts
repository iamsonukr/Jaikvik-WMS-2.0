import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ContactCustomFieldDocument = ContactCustomField & Document;

export enum ContactCustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  BOOLEAN = 'boolean',
}

@Schema({ timestamps: true })
export class ContactCustomField {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) key: string;
  @Prop({ required: true, enum: Object.values(ContactCustomFieldType), default: ContactCustomFieldType.TEXT }) type: ContactCustomFieldType;
  @Prop({ default: '' }) description: string;
  @Prop({ default: true }) isActive: boolean;
}

export const ContactCustomFieldSchema = SchemaFactory.createForClass(ContactCustomField);
ContactCustomFieldSchema.index({ whatsappAccountId: 1, key: 1 }, { unique: true });
ContactCustomFieldSchema.index({ tenantId: 1 });
