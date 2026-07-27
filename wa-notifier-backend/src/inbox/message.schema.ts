import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) phone: string;
  @Prop() contactName: string;
  @Prop({ required: true }) direction: string; // inbound | outbound
  @Prop({ required: true }) type: string;      // text | image | audio | video | document | template
  @Prop() text: string;
  @Prop({ type: Object }) media: Record<string, any>;
  @Prop() waMessageId: string;
  @Prop() messageCategory: string;
  @Prop() appliedUnitPrice: number;
  @Prop() appliedTaxPercent: number;
  @Prop() chargedAmount: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WalletTransaction' }) walletTransactionId: Types.ObjectId;
  @Prop({ default: 'open' }) threadStatus: string; // open | assigned | resolved
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' }) assignedTo: Types.ObjectId;
  @Prop([String]) threadTags: string[];
  @Prop({ default: 'normal' }) priority: string; // low | normal | high | urgent
  @Prop() slaDueAt: Date;
  @Prop({ type: [Object], default: [] }) internalNotes: Array<{
    text: string;
    authorId?: Types.ObjectId;
    authorName?: string;
    createdAt: Date;
  }>;
  @Prop() timestamp: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ whatsappAccountId: 1, phone: 1 });
MessageSchema.index({ tenantId: 1 });
