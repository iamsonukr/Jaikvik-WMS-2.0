import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
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

export class ResetTenantUserPasswordDto {
  @IsString() @MinLength(6) newPassword: string;
}
