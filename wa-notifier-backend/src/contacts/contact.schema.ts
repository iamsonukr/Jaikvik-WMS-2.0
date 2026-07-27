import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) phone: string;   // E.164 e.g. +919876543210
  @Prop() name: string;
  @Prop([String]) tags: string[];
  @Prop({ type: Object }) variables: Record<string, string>; // {{1}}, {{2}} personalisation
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: false }) isOptedOut: boolean;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
ContactSchema.index({ whatsappAccountId: 1, phone: 1 }, { unique: true });
ContactSchema.index({ tenantId: 1 });
