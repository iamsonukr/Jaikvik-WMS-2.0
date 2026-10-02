import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsIn, IsObject, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const ZAPIER_EVENTS = ['contact.created', 'message.received', 'message.status_updated'];
export class CreateZapierHookDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsIn(ZAPIER_EVENTS) event: string;
  @IsString() @MaxLength(500) url: string;
}
export class ToggleZapierHookDto { @IsBoolean() enabled: boolean; }
export class ZapierContactDto {
  @IsString() @Matches(/^[a-zA-Z0-9_.:@/-]{1,150}$/) requestId: string;
  @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(200) name?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(100, { each: true }) tags?: string[];
  @ValidateIf((_object, value) => value !== undefined) @IsObject() customFields?: Record<string, any>;
}
export class ZapierSendDto {
  @IsString() @Matches(/^[a-zA-Z0-9_.:@/-]{1,150}$/) requestId: string;
  @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone: string;
  @IsString() @MinLength(1) @MaxLength(200) templateName: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(2000, { each: true }) bodyParameters: string[];
  @Equals(true, { message: 'consent must be the JSON boolean true to confirm WhatsApp messaging permission.' }) consent: boolean;
}
