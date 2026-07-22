import { IsBoolean, IsIn, IsMongoId, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateChatbotRuleDto {
  @IsMongoId() clientId: string;
  @IsString() @MinLength(1) keyword: string;
  @IsOptional() @IsIn(['contains', 'exact', 'starts_with']) matchType?: string;
  @IsString() @MinLength(1) replyText: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() priority?: number;
}

export class UpdateChatbotRuleDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsIn(['contains', 'exact', 'starts_with']) matchType?: string;
  @IsOptional() @IsString() replyText?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() priority?: number;
}
