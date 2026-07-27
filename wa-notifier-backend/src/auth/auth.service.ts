import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './user.schema';
import { CreateTenantUserDto, LoginDto, RegisterDto } from './auth.dto';
import { TENANT_SCOPED_ROLES, UserRole, normalizeUserRole } from '../common/enums/role.enum';
import { TenantsService } from '../tenants/tenants.service';
import { toObjectId } from '../common/mongo-id';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private tenantsService: TenantsService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException('Email already in use');

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
      tenantId: tenant._id,
    });
    return this.tokenFor(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('This account has been disabled');
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return this.tokenFor(user);
  }

  async me(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) return null;
    const normalized = user.toObject();
    normalized.role = normalizeUserRole(normalized.role) as any;
    return normalized;
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
      tenantId: null, // platform staff are never scoped to a tenant
      permissions: dto.permissions || [],
    });
  }

  async updateStaff(id: string, dto: { role?: string; permissions?: string[]; isActive?: boolean }) {
    const user = await this.userModel.findByIdAndUpdate(id, dto, { new: true }).select('-password');
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

  async updateProfile(userId: string, dto: { name?: string; email?: string }) {
    return this.userModel.findByIdAndUpdate(userId, dto, { new: true }).select('-password');
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    user.password = newPassword; // pre-save hook hashes it
    await user.save();
    return { message: 'Password updated' };
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant) throw new NotFoundException('Client tenant not found');
    return tenant;
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
      },
    };
  }
}
