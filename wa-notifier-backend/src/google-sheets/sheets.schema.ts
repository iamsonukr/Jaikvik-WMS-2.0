import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Schema as M, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SheetsConnection {
  @Prop({ type: M.Types.ObjectId, required: true, unique: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ select: false }) refreshToken: string;
  @Prop({ select: false }) oauthAttempt: string;
  @Prop({ default: false }) connected: boolean;
  @Prop({ type: Object, default: {} }) settings: Record<string, any>;
  @Prop({ default: 0 }) revision: number;
  @Prop() lockOwner: string;
  @Prop() lockedUntil: Date;
  @Prop() lastSyncAt: Date;
  @Prop() lastError: string;
  @Prop({ type: Object }) lastResult: Record<string, any>;
  @Prop({ type: Object, default: {} }) managedTabs: Record<string, any>;
}
export const SheetsConnectionSchema = SchemaFactory.createForClass(SheetsConnection);

@Schema({ timestamps: true })
export class SheetsOAuthState {
  @Prop({ unique: true, required: true }) hash: string;
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop() browserHash: string;
  @Prop() verifier: string;
  @Prop({ required: true }) expiresAt: Date;
}
export const SheetsOAuthStateSchema = SchemaFactory.createForClass(SheetsOAuthState);
SheetsOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true })
export class SheetsEvent {
  @Prop({ type: M.Types.ObjectId, required: true }) whatsappAccountId: Types.ObjectId;
  @Prop({ required: true, unique: true }) key: string;
  @Prop() phone: string;
  @Prop() trigger: string;
  @Prop() status: string;
  @Prop() error: string;
  @Prop({ type: M.Types.ObjectId }) messageId: Types.ObjectId;
}
export const SheetsEventSchema = SchemaFactory.createForClass(SheetsEvent);
SheetsEventSchema.index({ whatsappAccountId: 1, createdAt: -1 });
