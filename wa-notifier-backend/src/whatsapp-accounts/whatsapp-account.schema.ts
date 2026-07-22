import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsAppAccountDocument = WhatsAppAccount & Document;

// NOTE: this schema was previously named `Client`. It represents a connected
// WhatsApp Business Account (WABA + phone number), NOT a SaaS tenant/customer.
// Renamed to WhatsAppAccount to free up "Client" for the platform-tenant concept.
// The underlying Mongo collection name is kept as 'clients' so existing data
// and indexes carry over with zero migration risk.
@Schema({ timestamps: true, collection: 'clients' })
export class WhatsAppAccount {
  @Prop({ type: Types.ObjectId, ref: 'Tenant' })
  tenantId?: Types.ObjectId; // owning SaaS tenant; nullable during transition/backfill

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) wabaId: string;         // WhatsApp Business Account ID
  @Prop({ required: true }) phoneNumberId: string;  // Meta phone number ID
  @Prop({ required: true }) accessToken: string;    // Permanent token
  @Prop() phone: string;                            // display number
  @Prop({ default: true }) isActive: boolean;
  @Prop() timezone: string;
  @Prop() industry: string;
}

export const WhatsAppAccountSchema = SchemaFactory.createForClass(WhatsAppAccount);
// Unique constraint — webhook routing relies on phoneNumberId being one-to-one with an account
WhatsAppAccountSchema.index({ phoneNumberId: 1 }, { unique: true });
WhatsAppAccountSchema.index({ tenantId: 1 });
