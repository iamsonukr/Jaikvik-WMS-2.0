import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, UserSchema } from './user.schema';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { TenantsModule } from '../tenants/tenants.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { LoginChallenge, LoginChallengeSchema } from './login-challenge.schema';
import { TwoFactorService } from './two-factor.service';
import { EmailService } from '../common/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: LoginChallenge.name, schema: LoginChallengeSchema }]),
    TenantsModule,
    SubscriptionsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, TwoFactorService, EmailService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
