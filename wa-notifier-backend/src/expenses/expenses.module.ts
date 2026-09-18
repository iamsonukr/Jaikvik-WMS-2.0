import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../tenants/tenant.schema';
import { WhatsAppAccount, WhatsAppAccountSchema } from '../whatsapp-accounts/whatsapp-account.schema';
import { WalletTransaction, WalletTransactionSchema } from '../wallet/wallet-transaction.schema';
import { MetaService } from '../common/meta.service';
import { ExpensesController } from './expenses.controller';
import { MetaExpenseSnapshot, MetaExpenseSnapshotSchema } from './meta-expense.schema';
import { ExpensesService } from './expenses.service';
import { Broadcast, BroadcastLog, BroadcastLogSchema, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { Message, MessageSchema } from '../inbox/message.schema';
import { WhatsAppAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: WhatsAppAccount.name, schema: WhatsAppAccountSchema },
      { name: WalletTransaction.name, schema: WalletTransactionSchema },
      { name: MetaExpenseSnapshot.name, schema: MetaExpenseSnapshotSchema },
      { name: Broadcast.name, schema: BroadcastSchema },
      { name: BroadcastLog.name, schema: BroadcastLogSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    WhatsAppAccountsModule,
  ],
  providers: [ExpensesService, MetaService],
  controllers: [ExpensesController],
})
export class ExpensesModule {}
