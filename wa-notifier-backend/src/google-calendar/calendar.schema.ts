import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Schema as M, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CalendarRecipient {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true }) calendarId: string;
  @Prop({ required: true }) eventId: string;
  @Prop() phone: string;
  @Prop() name: string;
  @Prop({ default: false }) consent: boolean;
}
export const CalendarRecipientSchema = SchemaFactory.createForClass(CalendarRecipient);
CalendarRecipientSchema.index({ whatsappAccountId: 1, calendarId: 1, eventId: 1 }, { unique: true });

@Schema({ timestamps: true })
export class CalendarDelivery {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true, unique: true }) key: string;
  @Prop() eventName: string;
  @Prop() status: string;
  @Prop() error: string;
  @Prop() messageId: string;
}
export const CalendarDeliverySchema = SchemaFactory.createForClass(CalendarDelivery);

@Schema({ timestamps: true })
export class CalendarConnection {
  @Prop({ type: M.Types.ObjectId, required: true, unique: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ select: false }) refreshToken: string;
  @Prop({ select: false }) oauthAttempt: string;
  @Prop({ default: false }) connected: boolean;
  @Prop({ type: Object, default: {} }) settings: Record<string, any>;
  @Prop({ default: 0 }) revision: number;
  @Prop() lastSyncAt: Date;
  @Prop() lastError: string;
}
export const CalendarConnectionSchema = SchemaFactory.createForClass(CalendarConnection);

@Schema({ timestamps: true })
export class CalendarOAuthState {
  @Prop({ unique: true, required: true }) hash: string;
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop() browserHash: string;
  @Prop() verifier: string;
  @Prop({ required: true }) expiresAt: Date;
}
export const CalendarOAuthStateSchema = SchemaFactory.createForClass(CalendarOAuthState);
CalendarOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });


