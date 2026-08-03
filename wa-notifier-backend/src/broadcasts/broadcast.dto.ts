import { IsArray, IsDateString, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBroadcastDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) templateName: string;
  @IsString() languageCode: string;
  @IsOptional() @IsArray() components?: any[];
  @IsOptional() @IsArray() targetTags?: string[];
  @IsOptional() @IsArray() targetSegmentIds?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class UpdateBroadcastDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() templateName?: string;
  @IsOptional() @IsString() languageCode?: string;
  @IsOptional() @IsArray() components?: any[];
  @IsOptional() @IsArray() targetTags?: string[];
  @IsOptional() @IsArray() targetSegmentIds?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class TestBroadcastDto {
  @IsString() @MinLength(5) phone: string;
}
