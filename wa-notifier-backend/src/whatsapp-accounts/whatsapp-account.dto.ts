import { IsBoolean, IsMongoId, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateWhatsAppAccountDto {
  @IsOptional() @IsMongoId() tenantId?: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) wabaId: string;
  @IsString() @MinLength(1) phoneNumberId: string;
  @IsString() @MinLength(1) accessToken: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() onboardingMode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWhatsAppAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() wabaId?: string;
  @IsOptional() @IsString() phoneNumberId?: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() onboardingMode?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EmbeddedSignupDto {
  @IsOptional() @IsMongoId() tenantId?: string;
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) wabaId: string;
  @IsOptional() @IsString() phoneNumberId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() redirectUri?: string;
  @IsOptional() @IsString() onboardingMode?: string;
}

export class PublicEmbeddedSignupDto extends EmbeddedSignupDto {
  @IsString() @MinLength(1) inviteToken: string;
}

export class RegisterPhoneNumberDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'pin must be exactly 6 digits' })
  pin: string;
}
