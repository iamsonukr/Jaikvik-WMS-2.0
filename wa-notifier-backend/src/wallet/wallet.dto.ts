import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { WalletTransactionType } from './wallet-transaction.schema';

export class ManualAdjustmentDto {
  @Type(() => Number)
  @IsNumber() @Min(0.01) amount: number;
  @IsIn(['credit', 'debit']) direction: 'credit' | 'debit';
  @IsString() reason: string; // required — enforced by @IsString, not optional
}

export class LedgerQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(Object.values(WalletTransactionType)) type?: WalletTransactionType;
  @IsOptional() @IsIn(['credit', 'debit']) direction?: 'credit' | 'debit';
}

export class ReverseWalletTransactionDto {
  @IsIn(['refund', 'reversal']) action: 'refund' | 'reversal';
  @IsString() reason: string;
}
