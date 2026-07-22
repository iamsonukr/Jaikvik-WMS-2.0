import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformSettingsDocument = PlatformSettings & Document;

// Singleton document (always looked up/created with a fixed key) holding
// platform-wide defaults that aren't secrets — Razorpay/Meta credentials
// stay in environment variables, never in the database.
@Schema({ timestamps: true })
export class PlatformSettings {
  @Prop({ default: 'default', unique: true }) key: string;
  @Prop({ default: 'Jaikvik WMS' }) companyName: string;
  @Prop({ default: 'support@jaikvikwms.com' }) supportEmail: string;
  @Prop({ default: 18 }) defaultTaxPercent: number;
  @Prop({ default: 7 }) defaultTrialDays: number;
  @Prop({ default: 'INR' }) defaultCurrency: string;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
