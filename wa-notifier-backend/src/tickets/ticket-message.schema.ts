import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TicketMessageDocument = TicketMessage & Document;

@Schema({ timestamps: true })
export class TicketMessage {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Ticket', required: true }) ticketId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) senderId: Types.ObjectId;
  @Prop({ required: true, enum: ['client', 'master', 'admin', 'system'] }) senderRole: string;
  @Prop({ required: true }) body: string;
  @Prop({ default: 'message', enum: ['message', 'assignment', 'status', 'priority'] }) kind: string;
}

export const TicketMessageSchema = SchemaFactory.createForClass(TicketMessage);
TicketMessageSchema.index({ ticketId: 1, createdAt: 1 });
TicketMessageSchema.index({ tenantId: 1, createdAt: -1 });
