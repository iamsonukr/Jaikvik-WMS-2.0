import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ContactImportDocument = ContactImport & Document;

@Schema({ timestamps: true })
export class ContactImport {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop() fileName: string;
  @Prop({ default: 'completed', enum: ['completed', 'failed'] }) status: string;
  @Prop({ type: Object }) mapping: Record<string, string>;
  @Prop({ default: 0 }) totalRows: number;
  @Prop({ default: 0 }) validRows: number;
  @Prop({ default: 0 }) importableRows: number;
  @Prop({ default: 0 }) createdCount: number;
  @Prop({ default: 0 }) updatedCount: number;
  @Prop({ default: 0 }) skippedCount: number;
  @Prop({ default: 0 }) invalidRows: number;
  @Prop({ default: 0 }) duplicateRows: number;
  @Prop({ type: [Object], default: [] }) invalidReport: Array<Record<string, any>>;
  @Prop({ type: [Object], default: [] }) duplicateReport: Array<Record<string, any>>;
}

export const ContactImportSchema = SchemaFactory.createForClass(ContactImport);
ContactImportSchema.index({ whatsappAccountId: 1, createdAt: -1 });
ContactImportSchema.index({ tenantId: 1, createdAt: -1 });
