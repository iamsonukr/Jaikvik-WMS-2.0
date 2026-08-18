import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type WhatsAppAccountDocument = WhatsAppAccount & Document;

// NOTE: this schema was previously named `Client`. It represents a connected
// WhatsApp Business Account (WABA + phone number), NOT a SaaS tenant/customer.
@Schema({ timestamps: true, collection: 'whatsappaccounts' })
export class WhatsAppAccount {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant' })
  tenantId?: Types.ObjectId; // owning SaaS tenant; nullable during transition/backfill

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) wabaId: string;         // WhatsApp Business Account ID
  @Prop() businessId: string;                       // Owning Meta Business ID
  @Prop({ required: true }) phoneNumberId: string;  // Meta phone number ID
  @Prop({ required: true }) accessToken: string;    // Permanent token
  @Prop() phone: string;                            // display number
  @Prop({ default: 'cloud_api' }) onboardingMode: string; // cloud_api | business_app
  @Prop({ default: true }) isActive: boolean;
  @Prop() timezone: string;
  @Prop() industry: string;
}

export const WhatsAppAccountSchema = SchemaFactory.createForClass(WhatsAppAccount);
// Unique constraint — webhook routing relies on phoneNumberId being one-to-one with an account
WhatsAppAccountSchema.index({ phoneNumberId: 1 }, { unique: true });
WhatsAppAccountSchema.index({ tenantId: 1 });
