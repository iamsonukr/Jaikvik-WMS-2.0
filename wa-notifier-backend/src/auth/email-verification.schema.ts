import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
export type EmailVerificationDocument = EmailVerification & Document;
@Schema()
export class EmailVerification {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) purpose: string;
  @Prop({ required: true }) email: string;
  @Prop() ownerId?: string;
  @Prop() securityVersion?: number;
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop() otpHash?: string;
  @Prop() otpExpiresAt?: Date;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ required: true }) nextSendAt: Date;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ default: false }) consumed: boolean;
}
export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification);
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
