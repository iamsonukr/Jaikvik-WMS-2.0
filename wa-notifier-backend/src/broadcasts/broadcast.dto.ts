import { IsArray, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBroadcastDto {
  @IsOptional() @IsMongoId() whatsappAccountId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) templateName: string;
  @IsString() languageCode: string;
  @IsOptional() @IsArray() components?: any[];
  @IsOptional() @IsArray() targetTags?: string[];
  @IsOptional() @IsString() status?: string;
}

export class UpdateBroadcastDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() templateName?: string;
  @IsOptional() @IsString() languageCode?: string;
  @IsOptional() @IsArray() components?: any[];
  @IsOptional() @IsArray() targetTags?: string[];
  @IsOptional() @IsString() status?: string;
}
