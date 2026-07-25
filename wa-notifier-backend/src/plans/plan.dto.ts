import { IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { PlanStatus } from './plan.schema';

export class CreatePlanDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsObject() price?: Record<string, any> | null;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsNumber() @Min(0) trialDays?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsObject() limits?: Record<string, any>;
  @IsOptional() @IsNumber() @Min(0) contacts?: number | null;
  @IsOptional() @IsNumber() @Min(0) teamMembers?: number | null;
  @IsOptional() @IsNumber() @Min(0) whatsappNumbers?: number | null;
  @IsOptional() @IsNumber() @Min(0) customFields?: number | null;
  @IsOptional() @IsNumber() @Min(0) tags?: number | null;
  @IsOptional() @IsObject() messageRates?: Record<string, any>;

  @IsOptional() @IsEnum(PlanStatus) status?: PlanStatus;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsBoolean() isPopular?: boolean;
  @IsOptional() @IsBoolean() showOnWebsite?: boolean;
  @IsOptional() @IsString() buttonText?: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsObject() price?: Record<string, any> | null;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsNumber() @Min(0) trialDays?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsObject() limits?: Record<string, any>;
  @IsOptional() @IsNumber() @Min(0) contacts?: number | null;
  @IsOptional() @IsNumber() @Min(0) teamMembers?: number | null;
  @IsOptional() @IsNumber() @Min(0) whatsappNumbers?: number | null;
  @IsOptional() @IsNumber() @Min(0) customFields?: number | null;
  @IsOptional() @IsNumber() @Min(0) tags?: number | null;
  @IsOptional() @IsObject() messageRates?: Record<string, any>;

  @IsOptional() @IsEnum(PlanStatus) status?: PlanStatus;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsBoolean() isPopular?: boolean;
  @IsOptional() @IsBoolean() showOnWebsite?: boolean;
  @IsOptional() @IsString() buttonText?: string;
}

export class ReorderPlansDto {
  // Ordered array of plan IDs — index in the array becomes the new displayOrder.
  @IsString({ each: true }) orderedIds: string[];
}
