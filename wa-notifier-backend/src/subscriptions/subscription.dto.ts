import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class AssignSubscriptionDto {
  @IsString() tenantId: string;
  @IsString() planId: string;
  @IsOptional() @IsDateString() startDate?: string; // defaults to now
}

export class ChangeSubscriptionPlanDto {
  @IsString() planId: string;
}

export class ExtendSubscriptionDto {
  @IsDateString() newEndDate: string;
}

export class CancelSubscriptionDto {
  @IsOptional() @IsString() reason?: string;
}

export class UpdateAutoRenewDto {
  @IsBoolean() autoRenew: boolean;
}
