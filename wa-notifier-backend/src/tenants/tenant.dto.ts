import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() slug?: string; // auto-derived from name if omitted
  @IsEmail() contactEmail: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTenantStatusDto {
  @IsIn(['active', 'suspended', 'disabled'])
  status: string;
}
