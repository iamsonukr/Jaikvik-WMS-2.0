import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CalendlyConnectDto {
  @IsString() @MinLength(10) @MaxLength(4000) token: string;
}
export const CALENDLY_FIELDS = ['name', 'event_name', 'start_time', 'timezone', 'location', 'cancel_url', 'reschedule_url'];
export class CalendlyRuleDto {
  @IsBoolean() enabled: boolean;
  @IsString() @MaxLength(200) templateName: string;
  @IsArray() @ArrayMaxSize(30) @IsIn(CALENDLY_FIELDS, { each: true }) parameters: string[];
}
export class CalendlySettingsDto {
  @IsString() @MaxLength(300) phoneQuestion: string;
  @IsString() @MinLength(1) @MaxLength(300) consentQuestion: string;
  @IsString() @MinLength(1) @MaxLength(300) consentAnswer: string;
  @IsInt() @Min(5) @Max(10080) reminderMinutes: number;
  @ValidateNested() @Type(() => CalendlyRuleDto) confirmation: CalendlyRuleDto;
  @ValidateNested() @Type(() => CalendlyRuleDto) cancellation: CalendlyRuleDto;
  @ValidateNested() @Type(() => CalendlyRuleDto) reminder: CalendlyRuleDto;
}
