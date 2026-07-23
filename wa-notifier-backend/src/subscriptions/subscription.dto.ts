import { IsBoolean, IsDateString, IsMongoId, IsOptional, IsString } from 'class-validator';

export class AssignSubscriptionDto {
  @IsMongoId() tenantId: string;
  @IsMongoId() planId: string;
  @IsOptional() @IsDateString() startDate?: string; // defaults to now
}

export class ChangeSubscriptionPlanDto {
  @IsMongoId() planId: string;
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
