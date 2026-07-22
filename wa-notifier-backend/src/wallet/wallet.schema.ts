import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, unique: true }) tenantId: Types.ObjectId;
  @Prop({ default: 0 }) balance: number;
  @Prop({ default: 0 }) totalRecharged: number;
  @Prop({ default: 0 }) totalSpent: number;
  @Prop({ default: 'INR' }) currency: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
