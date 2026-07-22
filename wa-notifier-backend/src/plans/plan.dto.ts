import { IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { BillingCycle, PlanStatus } from './plan.schema';

export class CreatePlanDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsNumber() @Min(0) price?: number | null;
  @IsEnum(BillingCycle) billingCycle: BillingCycle;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsNumber() @Min(0) trialDays?: number;

  @IsOptional() @IsObject() features?: Record<string, any>;
  @IsOptional() @IsObject() limits?: Record<string, any>;

  @IsOptional() @IsEnum(PlanStatus) status?: PlanStatus;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsBoolean() isPopular?: boolean;
  @IsOptional() @IsBoolean() showOnWebsite?: boolean;
  @IsOptional() @IsString() buttonText?: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsNumber() @Min(0) price?: number | null;
  @IsOptional() @IsEnum(BillingCycle) billingCycle?: BillingCycle;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsNumber() @Min(0) trialDays?: number;

  @IsOptional() @IsObject() features?: Record<string, any>;
  @IsOptional() @IsObject() limits?: Record<string, any>;

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
