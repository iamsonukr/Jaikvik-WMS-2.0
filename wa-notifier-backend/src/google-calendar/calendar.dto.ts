import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
export const CALENDAR_FIELDS = ['name', 'event_name', 'start_time', 'timezone', 'location'];
export class CalendarSettingsDto {
  @IsString() @MinLength(1) @MaxLength(1024) calendarId: string;
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(5) @Max(10080) reminderMinutes: number;
  @IsString() @MaxLength(200) templateName: string;
  @IsArray() @ArrayMaxSize(30) @IsIn(CALENDAR_FIELDS, { each: true }) parameters: string[];
}
export class CalendarRecipientDto {
  @IsString() @MinLength(1) @MaxLength(1024) calendarId: string;
  @IsString() @MinLength(1) @MaxLength(1024) eventId: string;
  @IsString() @MaxLength(100) phone: string;
  @IsString() @MaxLength(200) name: string;
  @IsBoolean() consent: boolean;
}
