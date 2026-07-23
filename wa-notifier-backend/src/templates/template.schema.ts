import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TemplateDocument = Template & Document;

@Schema({ timestamps: true })
export class Template {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) clientId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop() category: string;
  @Prop() language: string;
  @Prop() status: string; // APPROVED | PENDING | REJECTED
  @Prop({ type: Object }) rawMeta: Record<string, any>;
  @Prop([Object]) components: any[];
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
TemplateSchema.index({ clientId: 1, name: 1 }, { unique: true });
TemplateSchema.index({ tenantId: 1 });
