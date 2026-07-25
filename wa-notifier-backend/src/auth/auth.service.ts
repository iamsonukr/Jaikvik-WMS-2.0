import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './user.schema';
import { LoginDto, RegisterDto } from './auth.dto';
import { TENANT_SCOPED_ROLES, UserRole, normalizeUserRole } from '../common/enums/role.enum';
import { TenantsService } from '../tenants/tenants.service';
import { toObjectId } from '../common/mongo-id';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private tenantsService: TenantsService,
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
