import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TenantDocument = Tenant & Document;

// A Tenant is a paying platform customer ("Client" in the product spec).
// Not to be confused with WhatsAppAccount, which is a connected WABA/phone
// number that belongs to a Tenant (a tenant may have several).
@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) slug: string;
  @Prop({ required: true, lowercase: true }) contactEmail: string;
  @Prop() contactPhone: string;
  @Prop() contactPerson: string;
  @Prop({ lowercase: true }) billingEmail: string;
  @Prop() website: string;
  @Prop() taxId: string;
  @Prop() industry: string;
  @Prop() timezone: string;
  @Prop() addressLine1: string;
  @Prop() addressLine2: string;
  @Prop() city: string;
  @Prop() state: string;
  @Prop() country: string;
  @Prop() postalCode: string;

  @Prop({ default: 'active', enum: ['active', 'suspended', 'disabled'] })
  status: string;

  // Denormalized "current plan" pointer for cheap reads (dashboard headers,
  // feature-gate checks). SubscriptionsService keeps this in sync; the
  // Subscription collection remains the source of truth / billing history.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Plan', default: null }) planId: Types.ObjectId | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Subscription', default: null }) currentSubscriptionId: Types.ObjectId | null;
  @Prop() subscriptionStartAt?: Date;
  @Prop() subscriptionEndAt?: Date;

  @Prop() notes: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
TenantSchema.index({ status: 1 });
