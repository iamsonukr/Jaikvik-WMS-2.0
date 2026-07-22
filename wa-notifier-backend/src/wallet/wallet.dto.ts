import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ManualAdjustmentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsIn(['credit', 'debit']) direction: 'credit' | 'debit';
  @IsString() reason: string; // required — enforced by @IsString, not optional
}

export class LedgerQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}
