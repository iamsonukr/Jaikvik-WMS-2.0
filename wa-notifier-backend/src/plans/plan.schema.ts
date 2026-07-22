import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlanDocument = Plan & Document;

export enum BillingCycle {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
  ON_REQUEST = 'on_request', // e.g. Enterprise — no fixed price
}

export enum PlanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true }) name: string;
  @Prop() description: string;

  // null when billingCycle is ON_REQUEST (e.g. Enterprise: "Price on request").
  @Prop({ default: null }) price: number | null;
  @Prop({ required: true, enum: Object.values(BillingCycle), default: BillingCycle.QUARTERLY })
  billingCycle: BillingCycle;
  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: 0 }) taxPercent: number;
  @Prop({ default: 0 }) trialDays: number;

  // Configurable feature flags/values — deliberately untyped so Admin can add
  // new feature keys without a schema change. e.g.
  // { unlimitedAgents: true, chatbotFlows: true, campaignSendSpeed: 'fast' }
  @Prop({ type: Object, default: {} }) features: Record<string, any>;

  // Numeric/quantity caps. e.g.
  // { contacts: 5000, teamMembers: 3, whatsappNumbers: 1, customFields: 10, tags: 20, customEvents: 5 }
  @Prop({ type: Object, default: {} }) limits: Record<string, any>;

  @Prop({ required: true, enum: Object.values(PlanStatus), default: PlanStatus.ACTIVE })
  status: PlanStatus;

  @Prop({ default: 0 }) displayOrder: number;
  @Prop({ default: false }) isPopular: boolean;
  @Prop({ default: true }) showOnWebsite: boolean;
  @Prop({ default: 'Choose Plan' }) buttonText: string;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
PlanSchema.index({ displayOrder: 1 });
