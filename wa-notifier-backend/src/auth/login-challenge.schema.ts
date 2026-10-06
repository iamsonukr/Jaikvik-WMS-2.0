import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongoSchema } from 'mongoose';

export type LoginChallengeDocument = LoginChallenge & Document;
@Schema({ timestamps: true })
export class LoginChallenge {
  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ required: true }) credentialHash: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() otpHash?: string;
  @Prop() otpExpiresAt?: Date;
  @Prop() recipient?: string;
  @Prop({ default: 0 }) attempts: number;
}
export const LoginChallengeSchema = SchemaFactory.createForClass(LoginChallenge);
LoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
LoginChallengeSchema.index({ userId: 1 });
