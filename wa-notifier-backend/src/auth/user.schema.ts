import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true }) email: string;
  @Prop({ required: true }) password: string;

  @Prop({ required: true, enum: Object.values(UserRole), default: UserRole.CLIENT_USER })
  role: UserRole;

  // Owning tenant. Required for CLIENT_OWNER/CLIENT_USER; null for platform
  // staff (ADMIN/MASTER aren't scoped to a single tenant).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', default: null })
  tenantId: Types.ObjectId | null;

  // Fine-grained capabilities for ADMIN accounts (e.g. 'plans:write', 'wallet:credit').
  // ADMIN implicitly has everything and ignores this list.
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: true }) isActive: boolean;
  @Prop() name: string;
  @Prop() lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ tenantId: 1 });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
