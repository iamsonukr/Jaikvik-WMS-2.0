import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class SheetSelectionDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{10,200}$/) spreadsheetId: string;
  @IsInt() @Min(0) sheetId: number;
}
export class SheetSettingsDto extends SheetSelectionDto {
  @IsBoolean() enabled: boolean;
  @IsBoolean() importContacts: boolean;
  @IsBoolean() exportLeads: boolean;
  @IsBoolean() exportReports: boolean;
  @IsInt() @Min(5) @Max(1440) intervalMinutes: number;
  @IsString() @MaxLength(200) phoneColumn: string;
  @IsOptional() @IsString() @MaxLength(200) nameColumn?: string;
  @IsOptional() @IsString() @MaxLength(200) tagsColumn?: string;
  @IsObject() customFields: Record<string, string>;
  @IsIn(['off', 'new_row', 'due_date']) automation: string;
  @IsOptional() @IsString() @MaxLength(200) consentColumn?: string;
  @IsOptional() @IsString() @MaxLength(200) dueColumn?: string;
  @IsOptional() @IsString() @MaxLength(200) statusColumn?: string;
  @IsOptional() @IsString() @MaxLength(200) templateName?: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) parameterColumns: string[];
}
