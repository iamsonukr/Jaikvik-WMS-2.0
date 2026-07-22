import { IsArray, IsBoolean, IsMongoId, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsMongoId() clientId: string;
  @IsString() @MinLength(1) phone: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() variables?: Record<string, string>;
}

export class UpdateContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() variables?: Record<string, string>;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isOptedOut?: boolean;
}

export class BulkContactsDto {
  @IsMongoId() clientId: string;
  @IsArray() contacts: Array<{ phone: string; name?: string; tags?: string[] }>;
}
