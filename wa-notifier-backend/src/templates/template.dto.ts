import { ArrayMaxSize, IsArray, IsIn, IsMongoId, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsOptional()
  @IsMongoId()
  whatsappAccountId?: string;

  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsString()
  @MinLength(1)
  language: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  quickReplies?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  bodyExamples?: string[];

  @IsOptional()
  @IsString()
  libraryTemplateName?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  libraryTemplateButtonInputs?: Record<string, any>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  libraryTemplateBodyInputs?: Record<string, any>[];
}
