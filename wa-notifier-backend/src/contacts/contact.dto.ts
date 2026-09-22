import { IsArray, IsBoolean, IsIn, IsMongoId, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { ContactCustomFieldType } from './contact-custom-field.schema';
import { Type } from 'class-transformer';
import { ValidateNested, ArrayMaxSize } from 'class-validator';

export class CreateContactDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() @MinLength(1) phone: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() variables?: Record<string, string>;
  @IsOptional() @IsObject() customFields?: Record<string, any>;
}

export class UpdateContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() variables?: Record<string, string>;
  @IsOptional() @IsObject() customFields?: Record<string, any>;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isOptedOut?: boolean;
}

export class BulkContactsDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsArray() contacts: Array<{ phone: string; name?: string; tags?: string[]; variables?: Record<string, string>; customFields?: Record<string, any>; rowNumber?: number }>;
  @IsOptional() @IsString() fileName?: string;
  @IsOptional() @IsObject() mapping?: Record<string, string>;
}

export class PreviewContactImportDto extends BulkContactsDto {}

export class CommitContactImportDto extends BulkContactsDto {
  @IsOptional() @IsBoolean() updateExisting?: boolean;
}

export class CreateContactTagDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateContactTagDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateContactCustomFieldDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() @MinLength(1) label: string;
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsIn(Object.values(ContactCustomFieldType)) type?: ContactCustomFieldType;
  @IsOptional() @IsString() description?: string;
}

export class UpdateContactCustomFieldDto {
  @IsOptional() @IsString() @MinLength(1) label?: string;
  @IsOptional() @IsIn(Object.values(ContactCustomFieldType)) type?: ContactCustomFieldType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SegmentConditionDto {
  @IsString() field: string;
  @IsIn(['equals', 'not_equals', 'contains', 'not_contains', 'is_set', 'is_not_set', 'greater_than', 'less_than', 'before', 'after']) operator: string;
  @IsOptional() @IsString() value?: string;
}

export class CreateContactSegmentDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SegmentConditionDto) conditions?: SegmentConditionDto[];
  @IsOptional() @IsIn(['any', 'all']) matchMode?: 'any' | 'all';
}

export class UpdateContactSegmentDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SegmentConditionDto) conditions?: SegmentConditionDto[];
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsIn(['any', 'all']) matchMode?: 'any' | 'all';
  @IsOptional() @IsBoolean() isActive?: boolean;
}
