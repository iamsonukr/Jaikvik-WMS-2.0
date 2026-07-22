import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './wallet.schema';
import { WalletTransaction, WalletTransactionSchema } from './wallet-transaction.schema';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
    ]),
    AuditLogModule,
  ],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService, MongooseModule],
})
export class WalletModule {}
