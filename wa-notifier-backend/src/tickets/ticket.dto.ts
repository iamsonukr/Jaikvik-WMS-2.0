import { IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTicketDto {
  @IsOptional() @IsMongoId()
  tenantId?: string;

  @IsString() @MinLength(1)
  subject: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @IsString() @MinLength(1)
  message: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsIn(['open', 'assigned', 'pending', 'resolved', 'closed'])
  status?: string;

  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @IsOptional() @IsString()
  category?: string;
}

export class AssignTicketDto {
  @IsOptional() @IsMongoId()
  assignedTo?: string | null;
}

export class CreateTicketMessageDto {
  @IsString() @MinLength(1)
  body: string;
}
