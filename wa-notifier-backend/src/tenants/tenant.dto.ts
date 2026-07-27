import { IsEmail, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateTenantDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() slug?: string; // auto-derived from name if omitted
  @IsEmail() contactEmail: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @ValidateIf((_, value) => value !== '') @IsOptional() @IsEmail() billingEmail?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @ValidateIf((_, value) => value !== '') @IsOptional() @IsEmail() billingEmail?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTenantStatusDto {
  @IsIn(['active', 'suspended', 'disabled'])
  status: string;
}
