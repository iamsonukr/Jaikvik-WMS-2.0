import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MessageCategory, PricingScope } from './message-pricing.schema';

export class CreateMessagePricingDto {
  @IsEnum(MessageCategory) category: MessageCategory;
  @IsOptional() @IsString() country?: string; // defaults to 'default'
  @IsEnum(PricingScope) scope: PricingScope;
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsString() tenantId?: string;

  @IsNumber() @Min(0) baseCost: number;
  @IsNumber() @Min(0) sellingPrice: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateMessagePricingDto {
  @IsOptional() @IsNumber() @Min(0) baseCost?: number;
  @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
