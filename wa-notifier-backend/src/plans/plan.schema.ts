import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanDocument = Plan & Document;

export enum PlanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export const DEFAULT_MESSAGE_RATES = {
  marketing: 0,
  authentication: 0,
  utility: 0,
  service: 0,
};

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true }) name: string;
  @Prop() description: string;

  // null for price-on-request plans. Otherwise stores prices per selectable cycle.
  @Prop({ type: Object, default: null })
  price: {
    monthly?: number | null;
    quarterly?: number | null;
    yearly?: number | null;
  } | null;

  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: 0 }) taxPercent: number;
  @Prop({ default: 0 }) trialDays: number;

  // Configurable feature flags/values so Admin can add new feature keys without a schema change.
  @Prop({ type: [String], default: [] }) features: string[];

  // Numeric/quantity caps. e.g. { contacts: 5000, teamMembers: 3, whatsappNumbers: 1 }
  @Prop({ type: Object, default: {} }) limits: Record<string, any>;

  @Prop({ type: Number, default: null }) contacts: number | null;
  @Prop({ type: Number, default: null }) teamMembers: number | null;
  @Prop({ type: Number, default: null }) whatsappNumbers: number | null;
  @Prop({ type: Number, default: null }) customFields: number | null;
  @Prop({ type: Number, default: null }) tags: number | null;

  // Per-message selling rates for this plan, keyed by Meta template category.
  @Prop({ type: Object, default: () => ({ ...DEFAULT_MESSAGE_RATES }) })
  messageRates: {
    marketing?: number;
    authentication?: number;
    utility?: number;
    service?: number;
  };

  @Prop({ required: true, enum: Object.values(PlanStatus), default: PlanStatus.ACTIVE })
  status: PlanStatus;

  @Prop({ default: 0 }) displayOrder: number;
  @Prop({ default: false }) isPopular: boolean;
  @Prop({ default: true }) showOnWebsite: boolean;
  @Prop({ default: 'Choose Plan' }) buttonText: string;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
PlanSchema.index({ displayOrder: 1 });