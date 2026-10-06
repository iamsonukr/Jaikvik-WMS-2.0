import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './user.schema';
import { CreateTenantUserDto, LoginDto, RegisterDto, UpdateTenantUserDto } from './auth.dto';
import { TENANT_SCOPED_ROLES, UserRole, normalizeUserRole } from '../common/enums/role.enum';
import { TenantsService } from '../tenants/tenants.service';
import { toObjectId } from '../common/mongo-id';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TwoFactorService } from './two-factor.service';
import { OtpSendDto, OtpVerifyDto, TwoFactorSettingsDto, TwoFactorAdminDto, ProfileDto } from './auth.dto';
import { EmailVerificationService } from './email-verification.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private tenantsService: TenantsService,
    private subscriptionsService: SubscriptionsService,
    private twoFactor: TwoFactorService,
    private emailVerification: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto) {
    dto.email = dto.email.trim().toLowerCase();
    await this.emailVerification.consume(dto.challengeToken, dto.otp, 'signup', dto.email);
    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException('Email already in use');
    const signupTrialPlan = await this.subscriptionsService.findSignupTrialPlan();

    // Public signup always provisions a brand-new tenant with this user as its owner.
    const tenant = await this.tenantsService.create({
      name: dto.companyName,
      contactEmail: dto.email,
    });

    const user = await this.userModel.create({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      role: UserRole.CLIENT_OWNER,
      emailVerified: true,
      twoFactorEnabled: false,
      tenantId: tenant._id,
    });
    await this.subscriptionsService.activateSignupTrial(String(tenant._id), signupTrialPlan);
    return this.tokenFor(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.trim().toLowerCase() });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    try { await this.assertTenantActive(user); } catch { throw new UnauthorizedException('Invalid credentials'); }
    if (user.emailVerified === false) return this.twoFactor.begin(user, 'primary');
    if (user.twoFactorEnabled) return this.twoFactor.begin(user);
    user.lastLoginAt = new Date();
    await user.save();
    return this.tokenFor(user);
  }

  sendOtp(dto: OtpSendDto) { return this.twoFactor.send(dto.challengeToken, dto.recipientId); }
  async verifyOtp(dto: OtpVerifyDto) {
    const verified = await this.twoFactor.verify(dto.challengeToken, dto.otp);
    const user = await this.userModel.findById(verified._id).select('+otpNextSendAt');
    if (!user || !user.isActive || user.password !== verified.password || user.email !== verified.email || (user.securityVersion || 0) !== (verified.securityVersion || 0)) {
      throw new UnauthorizedException('Verification failed. Please sign in again.');
    }
    try { await this.assertTenantActive(user); } catch { throw new UnauthorizedException('Verification failed. Please sign in again.'); }
    if ((verified as any).verifiedPrimaryEmail) {
      user.emailVerified = true;
      await user.save();
      if (user.twoFactorEnabled) {
        // The primary code already proved control of the registered email. An admin
        // still needs the environment-routed second factor; other accounts use the
        // just-verified primary code for this sign-in only.
        if (normalizeUserRole(user.role) === UserRole.ADMIN || (user.secondaryEmail && user.secondaryEmailVerifiedAt)) {
          return this.twoFactor.begin(user, 'login', true);
        }
      }
    }
    user.lastLoginAt = new Date();
    await user.save();
    return this.tokenFor(user);
  }
  async updateTwoFactor(userId: string, dto: TwoFactorSettingsDto) {
    const user = await this.twoFactor.setEnabled(userId, userId, dto.enabled, dto.currentPassword);
    return this.tokenFor(user);
  }
  async manageTwoFactor(actorId: string, targetId: string, dto: TwoFactorAdminDto) {
    const user = await this.twoFactor.setEnabled(actorId, targetId, ['reset', 'remove-secondary'].includes(dto.action) ? undefined : dto.action === 'enable', dto.currentPassword, dto.action === 'remove-secondary');
    return String(actorId) === String(targetId) ? this.tokenFor(user) : { user };
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) return null;
    const normalized = user.toObject();
    normalized.role = normalizeUserRole(normalized.role) as any;
    return normalized;
  }

  startRegistration(email: string) { return this.emailVerification.issue('signup', email); }
  resendRegistration(token: string) { return this.emailVerification.resend(token, 'signup'); }
  async startSecondaryEmail(userId: string, email: string, password: string) {
    const user = await this.twoFactor.confirmPassword(userId, password);
    if (email.trim().toLowerCase() === user.email) throw new BadRequestException('Use a different secondary email address.');
    return this.emailVerification.issue('secondary', email, String(user._id), user.securityVersion || 0);
  }
  async resendSecondaryEmail(userId: string, token: string) {
    const user = await this.userModel.findById(userId);
    return this.emailVerification.resend(token, 'secondary', String(user._id), user.securityVersion || 0);
  }
  async verifySecondaryEmail(userId: string, token: string, otp: string) {
    const user = await this.userModel.findById(userId);
    const email = await this.emailVerification.consume(token, otp, 'secondary', undefined, String(user._id), user.securityVersion || 0);
    const updated = await this.userModel.findOneAndUpdate({ _id: user._id, password: user.password, isActive: true, $or: [{ securityVersion: user.securityVersion || 0 }, { securityVersion: { $exists: false } }] }, {
      $set: { secondaryEmail: email, secondaryEmailVerifiedAt: new Date(), useSecondaryEmailForOtp: true }, $inc: { securityVersion: 1 },
    }, { new: true });
    if (!updated) throw new BadRequestException('Security settings changed. Verify the secondary email again.');
    return this.tokenFor(updated);
  }
  async removeAccountEmail(userId: string, emailType: 'primary' | 'secondary', password: string) {
    const user = await this.twoFactor.confirmPassword(userId, password);
    if (!user.secondaryEmail || (emailType === 'primary' && !user.secondaryEmailVerifiedAt)) throw new BadRequestException('Link and verify a secondary email before removing your primary email.');
    let updated;
    try {
      updated = await this.userModel.findOneAndUpdate({ _id: user._id, password: user.password, email: user.email, secondaryEmail: user.secondaryEmail, isActive: true, $or: [{ securityVersion: user.securityVersion || 0 }, { securityVersion: { $exists: false } }] }, {
        $set: { ...(emailType === 'primary' ? { email: user.secondaryEmail, emailVerified: true } : {}), useSecondaryEmailForOtp: false },
        $unset: { secondaryEmail: 1, secondaryEmailVerifiedAt: 1 }, $inc: { securityVersion: 1 },
      }, { new: true });
    } catch (error) {
      if (error?.code === 11000) throw new BadRequestException('This email cannot be used as your primary email.');
      throw error;
    }
    if (!updated) throw new BadRequestException('Security settings changed. Please try again.');
    return this.tokenFor(updated);
  }
  async secondaryEmailPreference(userId: string, useSecondary: boolean, password: string) {
    const user = await this.twoFactor.confirmPassword(userId, password);
    if (normalizeUserRole(user.role) === UserRole.ADMIN) throw new BadRequestException('Admin OTP recipients are configured through the environment.');
    if (useSecondary && (!user.secondaryEmail || !user.secondaryEmailVerifiedAt)) throw new BadRequestException('Verify a secondary email first.');
    user.useSecondaryEmailForOtp = useSecondary;
    await user.save();
    return this.tokenFor(user);
  }

  // ── Staff management (admin only, enforced at the controller) ──
  async listStaff() {
    return this.userModel
      .find({ role: { $in: [UserRole.ADMIN, UserRole.MASTER] } })
      .select('-password')
      .sort({ createdAt: -1 });
  }

  async createStaff(dto: { email: string; password: string; name: string; role: string; permissions?: string[] }) {
    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException('Email already in use');
    return this.userModel.create({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      role: dto.role,
      emailVerified: false,
      twoFactorEnabled: false,
      tenantId: null, // platform staff are never scoped to a tenant
      permissions: dto.permissions || [],
    });
  }

  async updateStaff(id: string, dto: { role?: string; permissions?: string[]; isActive?: boolean }) {
    const user = await this.userModel.findByIdAndUpdate(id, { $set: dto, $inc: { securityVersion: 1 } }, { new: true }).select('-password');
    if (!user) throw new BadRequestException('Staff account not found');
    return user;
  }

  async listTenantUsers(tenantId: string) {
    return this.userModel
      .find({
        tenantId: toObjectId(tenantId, 'tenantId'),
        role: { $in: TENANT_SCOPED_ROLES },
      })
      .select('-password')
      .sort({ role: 1, createdAt: 1 });
  }

  async createTenantUser(tenantId: string, dto: CreateTenantUserDto) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) throw new NotFoundException('Client tenant not found');

    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException('Email already in use');

    const user = await this.userModel.create({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      role: dto.role,
      tenantId: toObjectId(tenantId, 'tenantId'),
      emailVerified: false,
      twoFactorEnabled: false,
    });

    const created = user.toObject();
    delete created.password;
    created.role = normalizeUserRole(created.role) as any;
    return created;
  }

  async getTeamLimit(tenantId: string) {
    const tenantObjectId = toObjectId(tenantId, 'tenantId');
    const used = await this.userModel.countDocuments({
      tenantId: tenantObjectId,
      role: { $in: TENANT_SCOPED_ROLES },
      isActive: true,
    });

    const subscription = await this.subscriptionsService.currentForTenant(tenantId).catch(() => null);
    const plan = subscription?.planId as any;
    const rawLimit = plan?.teamMembers ?? plan?.limits?.teamMembers;
    const numericLimit = rawLimit === null || rawLimit === undefined || rawLimit === ''
      ? null
      : Number(rawLimit);
    const limit = Number.isFinite(numericLimit as number) && (numericLimit as number) >= 0
      ? numericLimit
      : null;

    return {
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, (limit as number) - used),
    };
  }

  async createTeamMember(tenantId: string, dto: CreateTenantUserDto) {
    await this.assertTenantExists(tenantId);
    const teamLimit = await this.getTeamLimit(tenantId);
    if (teamLimit.limit !== null && teamLimit.used >= teamLimit.limit) {
      throw new BadRequestException('Your current plan team member limit has been reached.');
    }

    return this.createTenantUser(tenantId, dto);
  }

  async updateTeamMember(tenantId: string, userId: string, dto: { role?: string; isActive?: boolean }, actorUserId: string) {
    const user = await this.findTenantTeamMember(tenantId, userId);
    if (String(user._id) === String(actorUserId) && dto.isActive === false) {
      throw new BadRequestException('You cannot disable your own account.');
    }
    if (String(user._id) === String(actorUserId) && dto.role && dto.role !== UserRole.CLIENT_OWNER) {
      throw new BadRequestException('You cannot change your own owner role.');
    }

    if (dto.role !== undefined) user.role = dto.role as UserRole;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await user.save();

    const updated = user.toObject();
    delete updated.password;
    updated.role = normalizeUserRole(updated.role) as any;
    return updated;
  }

  async resetTeamMemberPassword(tenantId: string, userId: string, newPassword: string) {
    const user = await this.findTenantTeamMember(tenantId, userId);
    user.password = newPassword;
    await user.save();

    const updated = user.toObject();
    delete updated.password;
    updated.role = normalizeUserRole(updated.role) as any;
    return { message: 'Password reset', user: updated };
  }

  async removeTeamMember(tenantId: string, userId: string, actorUserId: string) {
    if (String(userId) === String(actorUserId)) {
      throw new BadRequestException('You cannot remove your own account.');
    }

    const user = await this.findTenantTeamMember(tenantId, userId);
    await user.deleteOne();
    return { message: 'Team member removed' };
  }

  async resetTenantUserPassword(userId: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !TENANT_SCOPED_ROLES.includes(normalizeUserRole(user.role) as UserRole)) {
      throw new NotFoundException('Client login user not found');
    }

    user.password = newPassword; // pre-save hook hashes it
    await user.save();

    const updated = user.toObject();
    delete updated.password;
    updated.role = normalizeUserRole(updated.role) as any;
    return { message: 'Password reset', user: updated };
  }

  async updateTenantUser(userId: string, dto: UpdateTenantUserDto) {
    const user = await this.userModel.findById(userId);
    if (!user || !TENANT_SCOPED_ROLES.includes(normalizeUserRole(user.role) as UserRole)) {
      throw new NotFoundException('Client login user not found');
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('Email is required');
      const exists = await this.userModel.findOne({ email, _id: { $ne: user._id } });
      if (exists) throw new ConflictException('Email already in use');
      if (email !== user.email) user.emailVerified = false;
      user.email = email;
    }
    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.role !== undefined) user.role = dto.role as UserRole;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await user.save();

    const updated = user.toObject();
    delete updated.password;
    updated.role = normalizeUserRole(updated.role) as any;
    return updated;
  }

  async removeTenantUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !TENANT_SCOPED_ROLES.includes(normalizeUserRole(user.role) as UserRole)) {
      throw new NotFoundException('Client login user not found');
    }

    await user.deleteOne();
    return { message: 'Client login user deleted' };
  }

  async updateProfile(userId: string, dto: ProfileDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException('Unable to update profile.');
    const email = dto.email?.trim().toLowerCase();
    if (email && email !== user.email && user.twoFactorEnabled) await this.twoFactor.confirmPassword(userId, dto.currentPassword || '');
    if (email && email !== user.email) { user.email = email; user.emailVerified = false; }
    if (dto.name !== undefined) user.name = dto.name;
    await user.save();
    const updated = user.toObject();
    delete updated.password;
    return { ...updated, ...this.tokenFor(user) };
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.twoFactor.confirmPassword(userId, currentPassword);
    user.password = newPassword; // pre-save hook hashes it
    await user.save();
    return { message: 'Password updated', ...this.tokenFor(user) };
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) throw new NotFoundException('Client tenant not found');
    return tenant;
  }

  private async assertTenantActive(user: UserDocument) {
    const role = normalizeUserRole(user.role);
    if (!TENANT_SCOPED_ROLES.includes(role as UserRole)) return;
    if (!user.tenantId) throw new UnauthorizedException('Client tenant not found');

    const tenant = await this.tenantsService.findOne(String(user.tenantId));
    if (!tenant) throw new UnauthorizedException('Client tenant not found');
    if (tenant.status !== 'active') throw new UnauthorizedException('This client has been disabled');
  }

  private async findTenantTeamMember(tenantId: string, userId: string) {
    const user = await this.userModel.findOne({
      _id: toObjectId(userId, 'userId'),
      tenantId: toObjectId(tenantId, 'tenantId'),
      role: { $in: TENANT_SCOPED_ROLES },
    });
    if (!user) throw new NotFoundException('Team member not found');
    return user;
  }

  private tokenFor(user: UserDocument) {
    const role = normalizeUserRole(user.role) as UserRole;
    const payload = {
      sub: user._id,
      email: user.email,
      role,
      tenantId: user.tenantId ?? null,
      securityVersion: user.securityVersion || 0,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role,
        tenantId: user.tenantId ?? null,
        permissions: user.permissions ?? [],
        twoFactorEnabled: user.twoFactorEnabled || false,
        secondaryEmail: user.secondaryEmail,
        secondaryEmailVerifiedAt: user.secondaryEmailVerifiedAt,
        useSecondaryEmailForOtp: user.useSecondaryEmailForOtp || false,
        emailVerified: user.emailVerified,
      },
    };
  }
}
