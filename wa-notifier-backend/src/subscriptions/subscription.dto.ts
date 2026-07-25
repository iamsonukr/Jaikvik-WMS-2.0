import { IsBoolean, IsDateString, IsMongoId, IsOptional, IsString } from 'class-validator';
import { BillingCycle } from '../common/enums/billing-cycle.enum';

export class AssignSubscriptionDto {
  @IsMongoId() tenantId: string;
  @IsMongoId() planId: string;
  @IsOptional() @IsDateString() startDate?: string; // defaults to now
  @IsOptional() @IsString() billingCycle?: BillingCycle;
}

export class ChangeSubscriptionPlanDto {
  @IsMongoId() planId: string;
  @IsOptional() @IsString() billingCycle?: BillingCycle;
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
