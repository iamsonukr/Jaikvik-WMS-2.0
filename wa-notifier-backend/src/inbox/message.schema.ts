import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'WhatsAppAccount', required: true }) clientId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) phone: string;
  @Prop() contactName: string;
  @Prop({ required: true }) direction: string; // inbound | outbound
  @Prop({ required: true }) type: string;      // text | image | audio | video | document | template
  @Prop() text: string;
  @Prop({ type: Object }) media: Record<string, any>;
  @Prop() waMessageId: string;
  @Prop({ default: 'open' }) threadStatus: string; // open | assigned | resolved
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' }) assignedTo: Types.ObjectId;
  @Prop() timestamp: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ clientId: 1, phone: 1 });
MessageSchema.index({ tenantId: 1 });
