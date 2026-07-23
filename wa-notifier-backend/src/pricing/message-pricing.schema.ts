import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MessagePricingDocument = MessagePricing & Document;

export enum MessageCategory {
  MARKETING = 'marketing',
  AUTHENTICATION = 'authentication',
  UTILITY = 'utility',
  SERVICE = 'service',
}

export enum PricingScope {
  DEFAULT = 'default', // global fallback, country = 'default'
  COUNTRY = 'country',
  PLAN = 'plan',
  CLIENT = 'client', // tenant-specific override
}

@Schema({ timestamps: true })
export class MessagePricing {
  @Prop({ required: true, enum: Object.values(MessageCategory) }) category: MessageCategory;

  // ISO 3166-1 alpha-2 (e.g. 'IN'), or 'default' for the global fallback row.
  @Prop({ required: true, default: 'default' }) country: string;

  @Prop({ required: true, enum: Object.values(PricingScope) }) scope: PricingScope;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Plan', default: null }) planId: Types.ObjectId | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', default: null }) tenantId: Types.ObjectId | null;

  @Prop({ required: true }) baseCost: number; // platform's cost from Meta
  @Prop({ required: true }) sellingPrice: number; // what the tenant is charged
  @Prop({ default: 0 }) markup: number; // sellingPrice - baseCost, kept in sync on save
  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: 0 }) taxPercent: number;

  @Prop({ default: true }) isActive: boolean;
}

export const MessagePricingSchema = SchemaFactory.createForClass(MessagePricing);
MessagePricingSchema.index({ category: 1, country: 1, scope: 1, planId: 1, tenantId: 1 });

MessagePricingSchema.pre('save', function (next) {
  this.markup = Number((this.sellingPrice - this.baseCost).toFixed(4));
  next();
});
