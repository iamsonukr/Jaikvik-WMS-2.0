import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { TENANT_SCOPED_ROLES, UserRole, normalizeUserRole } from '../common/enums/role.enum';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private tenantsService: TenantsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.userModel.findById(payload.sub).select('-password');
    if (!user || !user.isActive) throw new UnauthorizedException();
    const normalized = user.toObject();
    normalized.role = normalizeUserRole(normalized.role) as any;
    if (TENANT_SCOPED_ROLES.includes(normalized.role as UserRole)) {
      if (!normalized.tenantId) throw new UnauthorizedException();
      const tenant = await this.tenantsService.findOne(String(normalized.tenantId));
      if (!tenant || tenant.status !== 'active') throw new UnauthorizedException();
    }
    return normalized;
  }
}
