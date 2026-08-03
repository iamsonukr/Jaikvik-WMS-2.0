import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TicketDocument = Ticket & Document;

export const TICKET_STATUSES = ['open', 'assigned', 'pending', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

@Schema({ timestamps: true })
export class Ticket {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null }) assignedTo?: Types.ObjectId | null;
  @Prop({ required: true, trim: true }) subject: string;
  @Prop({ default: 'general', trim: true }) category: string;
  @Prop({ default: 'normal', enum: TICKET_PRIORITIES }) priority: string;
  @Prop({ default: 'open', enum: TICKET_STATUSES }) status: string;
  @Prop() lastMessagePreview?: string;
  @Prop() lastMessageAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null }) lastMessageBy?: Types.ObjectId | null;
  @Prop() resolvedAt?: Date;
  @Prop() closedAt?: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1, updatedAt: -1 });
TicketSchema.index({ priority: 1, status: 1 });
TicketSchema.index({ subject: 'text', category: 'text', lastMessagePreview: 'text' });
