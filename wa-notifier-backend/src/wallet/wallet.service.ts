import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from './wallet.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
  WalletTransactionStatus,
  WalletTransactionType,
} from './wallet-transaction.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ObjectIdInput, toObjectId } from '../common/mongo-id';

export interface LedgerEntryInput {
  tenantId: ObjectIdInput;
  type: WalletTransactionType;
  amount: number;
  description?: string;
  referenceId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  campaignId?: string;
  messageId?: string;
  messageCategory?: string;
  appliedUnitPrice?: number;
  tax?: number;
  reason?: string;
  actorUserId?: string;
}

// Every credit/debit type maps to a direction and whether it should bump the
// wallet's lifetime totalRecharged/totalSpent counters.
const CREDIT_TYPES = new Set([
  WalletTransactionType.RECHARGE,
  WalletTransactionType.REFUND,
  WalletTransactionType.MANUAL_CREDIT,
  WalletTransactionType.REVERSAL,
]);

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(WalletTransaction.name) private txnModel: Model<WalletTransactionDocument>,
    private auditLog: AuditLogService,
  ) {}

  async getOrCreateWallet(tenantId: ObjectIdInput): Promise<WalletDocument> {
    const tenantObjectId = toObjectId(tenantId, 'tenantId');
    const wallet = await this.walletModel.findOneAndUpdate(
      { tenantId: tenantObjectId },
      { $setOnInsert: { tenantId: tenantObjectId, balance: 0, totalRecharged: 0, totalSpent: 0 } },
      { new: true, upsert: true },
    );
    return wallet;
  }

  async getBalance(tenantId: ObjectIdInput) {
    const wallet = await this.getOrCreateWallet(tenantId);
    return {
      balance: wallet.balance,
      totalRecharged: wallet.totalRecharged,
      totalSpent: wallet.totalSpent,
      currency: wallet.currency,
    };
  }

  async getLedger(tenantId: ObjectIdInput, page = 1, limit = 25) {
    page = Math.max(1, page);
    limit = Math.min(100, limit);
    const tenantObjectId = toObjectId(tenantId, 'tenantId');
    const [items, total] = await Promise.all([
      this.txnModel.find({ tenantId: tenantObjectId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.txnModel.countDocuments({ tenantId: tenantObjectId }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Applies a credit or debit atomically against the wallet's `balance`
   * using a single conditional findOneAndUpdate (not a multi-document
   * transaction — this project's MongoDB runs as a standalone node, not a
   * replica set, so multi-doc transactions aren't available). The balance
   * mutation itself is race-safe; debits are additionally guarded so the
   * update simply doesn't match (and this throws) if funds are insufficient,
   * which is what prevents negative balances under concurrent requests.
   */
  private async applyLedgerEntry(input: LedgerEntryInput): Promise<WalletTransactionDocument> {
    const isCredit = CREDIT_TYPES.has(input.type);
    const amount = Math.abs(input.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    const tenantObjectId = toObjectId(input.tenantId, 'tenantId');

    // Idempotency guard for Razorpay: if this payment ID was already
    // credited, the unique sparse index on razorpayPaymentId will reject a
    // second insert — callers should catch and treat as already-processed.
    if (input.razorpayPaymentId) {
      const existing = await this.txnModel.findOne({ razorpayPaymentId: input.razorpayPaymentId });
      if (existing) return existing;
    }

    let wallet: WalletDocument | null;
    if (isCredit) {
      const inc: Record<string, number> = { balance: amount };
      if (input.type === WalletTransactionType.RECHARGE) inc.totalRecharged = amount;
      wallet = await this.walletModel.findOneAndUpdate(
        { tenantId: tenantObjectId },
        { $inc: inc, $setOnInsert: { tenantId: tenantObjectId, totalSpent: 0 } },
        { new: true, upsert: true },
      );
    } else {
      wallet = await this.walletModel.findOneAndUpdate(
        { tenantId: tenantObjectId, balance: { $gte: amount } },
        { $inc: { balance: -amount, totalSpent: amount } },
        { new: true },
      );
      if (!wallet) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }

    const balanceAfter = wallet.balance;
    const balanceBefore = isCredit ? balanceAfter - amount : balanceAfter + amount;

    try {
      return await this.txnModel.create({
        tenantId: tenantObjectId,
        type: input.type,
        creditAmount: isCredit ? amount : 0,
        debitAmount: isCredit ? 0 : amount,
        balanceBefore,
        balanceAfter,
        description: input.description,
        referenceId: input.referenceId,
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        campaignId: input.campaignId,
        messageId: input.messageId,
        messageCategory: input.messageCategory,
        appliedUnitPrice: input.appliedUnitPrice,
        tax: input.tax || 0,
        status: WalletTransactionStatus.COMPLETED,
        reason: input.reason,
        actorUserId: input.actorUserId,
      });
    } catch (err: any) {
      // Ledger insert failed after the balance was already mutated (e.g. the
      // rare duplicate razorpayPaymentId race) — compensate by reversing the
      // balance change so the wallet doesn't silently drift.
      const compensating: Record<string, number> = isCredit
        ? { balance: -amount, ...(input.type === WalletTransactionType.RECHARGE ? { totalRecharged: -amount } : {}) }
        : { balance: amount, totalSpent: -amount };
      await this.walletModel.updateOne({ tenantId: tenantObjectId }, { $inc: compensating });

      if (err?.code === 11000 && input.razorpayPaymentId) {
        const existing = await this.txnModel.findOne({ razorpayPaymentId: input.razorpayPaymentId });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async recharge(tenantId: ObjectIdInput, amount: number, meta: Partial<LedgerEntryInput> = {}) {
    return this.applyLedgerEntry({ tenantId, type: WalletTransactionType.RECHARGE, amount, ...meta });
  }

  async debitForMessage(tenantId: ObjectIdInput, amount: number, meta: Partial<LedgerEntryInput> = {}) {
    return this.applyLedgerEntry({ tenantId, type: WalletTransactionType.MESSAGE_DEBIT, amount, ...meta });
  }

  async reserveForCampaign(tenantId: ObjectIdInput, amount: number, meta: Partial<LedgerEntryInput> = {}) {
    return this.applyLedgerEntry({ tenantId, type: WalletTransactionType.CAMPAIGN_RESERVATION, amount, ...meta });
  }

  async refund(tenantId: ObjectIdInput, amount: number, meta: Partial<LedgerEntryInput> = {}) {
    return this.applyLedgerEntry({ tenantId, type: WalletTransactionType.REFUND, amount, ...meta });
  }

  // Admin-initiated credit/debit. Requires a reason and always writes an
  // audit log entry, per the product spec.
  async manualAdjust(
    tenantId: string,
    direction: 'credit' | 'debit',
    amount: number,
    reason: string,
    actorUserId: string,
    actorRole: string,
  ) {
    if (!reason || !reason.trim()) throw new BadRequestException('A reason is required for manual wallet adjustments');

    const type = direction === 'credit' ? WalletTransactionType.MANUAL_CREDIT : WalletTransactionType.MANUAL_DEBIT;
    const txn = await this.applyLedgerEntry({ tenantId, type, amount, reason, actorUserId });

    await this.auditLog.log({
      actorUserId,
      actorRole,
      action: `wallet.${type}`,
      targetType: 'Wallet',
      targetId: tenantId,
      reason,
      metadata: { amount, balanceAfter: txn.balanceAfter },
    });

    return txn;
  }

  /**
   * Platform-wide revenue snapshot for the Admin dashboard charts.
   * "Recharge revenue" = cash actually collected via Razorpay (wallet
   * top-ups). "Message revenue" = what tenants have actually consumed
   * (message_debit + campaign_reservation debits, net of refunds) — this is
   * the platform's realized revenue from usage, distinct from the prepaid
   * cash sitting in wallets. Both numbers matter and aren't the same thing.
   */
  async platformSummary() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const sumSince = async (type: WalletTransactionType, since: Date, field: 'creditAmount' | 'debitAmount') => {
      const [row] = await this.txnModel.aggregate([
        { $match: { type, createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: `$${field}` } } },
      ]);
      return row?.total || 0;
    };

    const [rechargeToday, rechargeMonth, rechargeYear, refundsTotal] = await Promise.all([
      sumSince(WalletTransactionType.RECHARGE, startOfToday, 'creditAmount'),
      sumSince(WalletTransactionType.RECHARGE, startOfMonth, 'creditAmount'),
      sumSince(WalletTransactionType.RECHARGE, startOfYear, 'creditAmount'),
      sumSince(WalletTransactionType.REFUND, startOfYear, 'creditAmount'),
    ]);

    const messageSpend = async (since: Date) => {
      const [row] = await this.txnModel.aggregate([
        {
          $match: {
            type: { $in: [WalletTransactionType.MESSAGE_DEBIT, WalletTransactionType.CAMPAIGN_RESERVATION] },
            createdAt: { $gte: since },
          },
        },
        { $group: { _id: null, total: { $sum: '$debitAmount' } } },
      ]);
      return row?.total || 0;
    };
    const [messageRevenueMonth, messageRevenueYear] = await Promise.all([
      messageSpend(startOfMonth),
      messageSpend(startOfYear),
    ]);

    // Daily series for the last 14 days: recharge revenue vs message spend.
    const dailySeries = await this.txnModel.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          recharge: {
            $sum: { $cond: [{ $eq: ['$type', WalletTransactionType.RECHARGE] }, '$creditAmount', 0] },
          },
          spend: {
            $sum: {
              $cond: [
                { $in: ['$type', [WalletTransactionType.MESSAGE_DEBIT, WalletTransactionType.CAMPAIGN_RESERVATION]] },
                '$debitAmount',
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top 5 clients by lifetime spend.
    const topClients = await this.walletModel
      .find()
      .sort({ totalSpent: -1 })
      .limit(5)
      .populate('tenantId', 'name');

    return {
      rechargeRevenue: { today: rechargeToday, month: rechargeMonth, year: rechargeYear },
      messageRevenue: { month: messageRevenueMonth, year: messageRevenueYear },
      refundsTotal,
      dailySeries: dailySeries.map((d) => ({ date: d._id, recharge: d.recharge, spend: d.spend })),
      topClients: topClients.map((w) => ({
        tenantId: w.tenantId?._id,
        name: (w.tenantId as any)?.name || 'Unknown',
        totalSpent: w.totalSpent,
        balance: w.balance,
      })),
    };
  }
}
