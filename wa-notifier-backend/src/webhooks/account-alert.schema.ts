import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccountAlertDocument = AccountAlert & Document;

@Schema({ timestamps: true })
export class AccountAlert {
  @Prop({ type: Types.ObjectId, ref: 'WhatsAppAccount' }) clientId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop() field: string;
  @Prop() entityType: string;
  @Prop({ index: true }) entityId: string;
  @Prop() severity: string;
  @Prop() status: string;
  @Prop() type: string;
  @Prop() description: string;
  @Prop({ type: Object }) raw: any;
}

export const AccountAlertSchema = SchemaFactory.createForClass(AccountAlert);
AccountAlertSchema.index({ clientId: 1, createdAt: -1 });
AccountAlertSchema.index({ entityId: 1, type: 1, createdAt: -1 });
