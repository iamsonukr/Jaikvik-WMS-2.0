import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength, Matches, MaxLength } from 'class-validator';

export class OtpSendDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) challengeToken: string;
  @IsOptional() @IsString() @MaxLength(6) recipientId?: string;
}
export class OtpVerifyDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) challengeToken: string;
  @IsString() @Matches(/^\d{6}$/) otp: string;
}
export class TwoFactorSettingsDto {
  @IsBoolean() enabled: boolean;
  @IsString() @MinLength(1) @MaxLength(200) currentPassword: string;
}
export class TwoFactorAdminDto {
  @IsIn(['enable', 'disable', 'reset']) action: 'enable' | 'disable' | 'reset';
  @IsString() @MinLength(1) @MaxLength(200) currentPassword: string;
}
export class ProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() currentPassword?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(200) currentPassword: string;
  @IsString() @MinLength(6) @MaxLength(200) newPassword: string;
}

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() name: string;
  // Public self-signup always provisions a brand-new Tenant with this user as its owner.
  @IsString() @MinLength(1) companyName: string;
}

export class CreateStaffDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() name: string;
  @IsIn(['admin', 'master']) role: 'admin' | 'master';
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

export class UpdateStaffDto {
  @IsOptional() @IsIn(['admin', 'master']) role?: 'admin' | 'master';
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateTenantUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() name: string;
  @IsIn(['client_owner', 'client_user']) role: 'client_owner' | 'client_user';
}

export class UpdateTenantTeamUserDto {
  @IsOptional() @IsIn(['client_owner', 'client_user']) role?: 'client_owner' | 'client_user';
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateTenantUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['client_owner', 'client_user']) role?: 'client_owner' | 'client_user';
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetTenantUserPasswordDto {
  @IsString() @MinLength(6) newPassword: string;
}
