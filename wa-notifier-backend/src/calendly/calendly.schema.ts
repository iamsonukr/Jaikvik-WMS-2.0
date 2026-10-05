import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as M, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CalendlyConnection {
  @Prop({ type: M.Types.ObjectId, required: true, unique: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ select: false }) token: string;
  @Prop({ select: false }) signingKey: string;
  @Prop() subscription: string;
  @Prop() user: string;
  @Prop() name: string;
  @Prop({ default: false }) connected: boolean;
  @Prop({ default: 0 }) revision: number;
  @Prop({ type: Object, default: {} }) settings: Record<string, any>;
  @Prop() managementOwner: string;
  @Prop() managementUntil: Date;
}
export const CalendlyConnectionSchema = SchemaFactory.createForClass(CalendlyConnection);

@Schema({ timestamps: true })
export class CalendlyBooking {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true }) inviteeUri: string;
  @Prop({ required: true }) eventUri: string;
  @Prop() revision: number;
  @Prop({ default: 'active' }) status: string;
  @Prop() name: string;
  @Prop() phone: string;
  @Prop() consent: boolean;
  @Prop() eventName: string;
  @Prop() startTime: Date;
  @Prop() timezone: string;
  @Prop() cancelUrl: string;
  @Prop() rescheduleUrl: string;
  @Prop() location: string;
}
export const CalendlyBookingSchema = SchemaFactory.createForClass(CalendlyBooking);
CalendlyBookingSchema.index({ whatsappAccountId: 1, inviteeUri: 1, revision: 1 }, { unique: true });

@Schema({ timestamps: true })
export class CalendlyJob {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true }) key: string;
  @Prop() revision: number;
  @Prop({ type: M.Types.ObjectId }) bookingId: Types.ObjectId;
  @Prop() kind: string;
  @Prop({ default: 'pending' }) status: string;
  @Prop({ type: Object, select: false }) payload: Record<string, any>;
  @Prop({ type: Object }) rule: Record<string, any>;
  @Prop({ default: Date.now }) dueAt: Date;
  @Prop({ default: 0 }) attempts: number;
  @Prop() lockOwner: string;
  @Prop() lockedUntil: Date;
  @Prop() error: string;
  @Prop({ type: M.Types.ObjectId }) messageId: Types.ObjectId;
}
export const CalendlyJobSchema = SchemaFactory.createForClass(CalendlyJob);
CalendlyJobSchema.index({ whatsappAccountId: 1, key: 1, revision: 1 }, { unique: true });
CalendlyJobSchema.index({ status: 1, dueAt: 1 });
