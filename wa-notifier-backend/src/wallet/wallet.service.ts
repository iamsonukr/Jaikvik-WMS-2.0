import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import PDFDocument = require('pdfkit');
import { Wallet, WalletDocument } from './wallet.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
  WalletTransactionStatus,
  WalletTransactionType,
} from './wallet-transaction.schema';
import { LedgerQueryDto } from './wallet.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ObjectIdInput, toObjectId } from '../common/mongo-id';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';

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
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
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

  async getLedger(tenantId: ObjectIdInput, query: LedgerQueryDto = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
    const filter = this.ledgerFilter(tenantId, query);
    const [items, total] = await Promise.all([
      this.txnModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.txnModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
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

  async reverseTransaction(
    tenantId: string,
    transactionId: string,
    action: 'refund' | 'reversal',
    reason: string,
    actorUserId: string,
    actorRole: string,
  ) {
    if (!reason || !reason.trim()) throw new BadRequestException('A reason is required');

    const tenantObjectId = toObjectId(tenantId, 'tenantId');
    const transaction = await this.txnModel.findOne({
      _id: toObjectId(transactionId, 'transactionId'),
      tenantId: tenantObjectId,
    });
    if (!transaction) throw new NotFoundException('Wallet transaction not found');
    if (transaction.status === WalletTransactionStatus.REVERSED) {
      throw new BadRequestException('This transaction has already been reversed');
    }
    const amount = Number(transaction.debitAmount || 0);
    if (amount <= 0) throw new BadRequestException('Only debit transactions can be refunded or reversed');

    const type = action === 'refund' ? WalletTransactionType.REFUND : WalletTransactionType.REVERSAL;
    const duplicate = await this.txnModel.findOne({
      tenantId: tenantObjectId,
      type,
      referenceId: String(transaction._id),
    });
    if (duplicate) throw new BadRequestException('A linked refund/reversal already exists for this transaction');

    const reversal = await this.applyLedgerEntry({
      tenantId,
      type,
      amount,
      description: `${action === 'refund' ? 'Refund' : 'Reversal'} for ${transaction.type}`,
      referenceId: String(transaction._id),
      campaignId: transaction.campaignId ? String(transaction.campaignId) : undefined,
      messageId: transaction.messageId ? String(transaction.messageId) : undefined,
      messageCategory: transaction.messageCategory,
      reason: reason.trim(),
      actorUserId,
    });

    transaction.status = WalletTransactionStatus.REVERSED;
    await transaction.save();

    await this.auditLog.log({
      actorUserId,
      actorRole,
      action: `wallet.${type}`,
      targetType: 'WalletTransaction',
      targetId: String(transaction._id),
      reason,
      metadata: { tenantId, amount, reversalId: String(reversal._id), balanceAfter: reversal.balanceAfter },
    });

    return { message: action === 'refund' ? 'Transaction refunded' : 'Transaction reversed', transaction, reversal };
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

  async exportLedgerCsv(tenantId: ObjectIdInput, query: LedgerQueryDto = {}) {
    const tenant = await this.tenantModel.findById(toObjectId(tenantId, 'tenantId')).select('name');
    const items = await this.filteredLedgerItems(tenantId, query, 10000);
    const headers = [
      'Created',
      'Transaction ID',
      'Type',
      'Status',
      'Credit',
      'Debit',
      'Balance Before',
      'Balance After',
      'Description',
      'Reason',
      'Reference ID',
      'Campaign ID',
      'Message ID',
      'Message Category',
      'Actor User ID',
    ];
    const rows = items.map((txn: any) => [
      txn.createdAt ? new Date(txn.createdAt).toISOString() : '',
      txn._id,
      txn.type,
      txn.status,
      txn.creditAmount || 0,
      txn.debitAmount || 0,
      txn.balanceBefore ?? '',
      txn.balanceAfter ?? '',
      txn.description || '',
      txn.reason || '',
      txn.referenceId || '',
      txn.campaignId || '',
      txn.messageId || '',
      txn.messageCategory || '',
      txn.actorUserId || '',
    ]);

    return {
      filename: `${this.fileSlug(tenant?.name || 'client')}-wallet-ledger.csv`,
      csv: [headers, ...rows].map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\n'),
    };
  }

  async exportLedgerPdf(tenantId: ObjectIdInput, query: LedgerQueryDto = {}, statement = false): Promise<{ buffer: Buffer; filename: string }> {
    const tenantObjectId = toObjectId(tenantId, 'tenantId');
    const [tenant, wallet, items, summary] = await Promise.all([
      this.tenantModel.findById(tenantObjectId),
      this.getOrCreateWallet(tenantObjectId),
      this.filteredLedgerItems(tenantObjectId, query, 1000),
      this.ledgerSummary(tenantObjectId, query),
    ]);
    const title = statement ? 'Wallet Statement' : 'Wallet Ledger Export';
    const filename = `${this.fileSlug(tenant?.name || 'client')}-${statement ? 'wallet-statement' : 'wallet-ledger'}.pdf`;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 44 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename }));
      doc.on('error', reject);

      doc.fillColor('#111827').fontSize(18).text(title);
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#374151').text(tenant?.name || 'Unknown client');
      if (tenant?.contactEmail) doc.text(tenant.contactEmail);
      doc.fillColor('#6b7280').text(`Generated: ${new Date().toLocaleString('en-IN')}`);
      doc.text(`Period: ${this.periodLabel(query)}`);
      doc.moveDown();

      doc.fillColor('#111827').fontSize(11).text(`Current balance: ${this.money(wallet.balance)}`);
      doc.text(`Total recharged: ${this.money(wallet.totalRecharged)}   Total spent: ${this.money(wallet.totalSpent)}`);
      doc.text(`Filtered credits: ${this.money(summary.credit)}   Filtered debits: ${this.money(summary.debit)}   Entries: ${summary.count}`);
      doc.moveDown();

      const headers = ['Date', 'Type', 'Credit', 'Debit', 'Balance'];
      this.pdfRow(doc, headers, true);
      items.forEach((txn: any) => {
        if (doc.y > 760) {
          doc.addPage();
          this.pdfRow(doc, headers, true);
        }
        this.pdfRow(doc, [
          txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-IN') : '-',
          this.typeLabel(txn.type),
          txn.creditAmount ? this.money(txn.creditAmount) : '-',
          txn.debitAmount ? this.money(txn.debitAmount) : '-',
          this.money(txn.balanceAfter),
        ]);
        const note = txn.description || txn.reason || txn.referenceId;
        if (note) {
          doc.fontSize(7).fillColor('#6b7280').text(String(note).slice(0, 120), 48, doc.y, { width: 500 });
          doc.moveDown(0.35);
        }
      });

      if (items.length >= 1000) {
        doc.moveDown().fontSize(8).fillColor('#6b7280').text('PDF export is capped at 1000 filtered entries. Use CSV for larger exports.');
      }
      doc.end();
    });
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

  private ledgerFilter(tenantId: ObjectIdInput, query: LedgerQueryDto = {}) {
    const filter: Record<string, any> = { tenantId: toObjectId(tenantId, 'tenantId') };
    if (query.type) filter.type = query.type;
    if (query.direction === 'credit') filter.creditAmount = { $gt: 0 };
    if (query.direction === 'debit') filter.debitAmount = { $gt: 0 };

    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.$gte = this.parseDateBound(query.from, false);
    if (query.to) createdAt.$lte = this.parseDateBound(query.to, true);
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    return filter;
  }

  private parseDateBound(value: string, endOfDay: boolean) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date filter');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (endOfDay) date.setHours(23, 59, 59, 999);
      else date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  private filteredLedgerItems(tenantId: ObjectIdInput, query: LedgerQueryDto, max: number) {
    return this.txnModel.find(this.ledgerFilter(tenantId, query)).sort({ createdAt: -1 }).limit(max);
  }

  private async ledgerSummary(tenantId: ObjectIdInput, query: LedgerQueryDto) {
    const [row] = await this.txnModel.aggregate([
      { $match: this.ledgerFilter(tenantId, query) },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          credit: { $sum: '$creditAmount' },
          debit: { $sum: '$debitAmount' },
        },
      },
    ]);
    return { count: row?.count || 0, credit: row?.credit || 0, debit: row?.debit || 0 };
  }

  private csvCell(value: any) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  private fileSlug(value: string) {
    return String(value || 'wallet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wallet';
  }

  private periodLabel(query: LedgerQueryDto) {
    if (query.from && query.to) return `${query.from} to ${query.to}`;
    if (query.from) return `From ${query.from}`;
    if (query.to) return `Until ${query.to}`;
    return 'All time';
  }

  private money(value: any) {
    return `INR ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`;
  }

  private typeLabel(type: string) {
    return String(type || '').replace(/_/g, ' ');
  }

  private pdfRow(doc: PDFKit.PDFDocument, cells: string[], header = false) {
    const y = doc.y;
    const widths = [78, 165, 85, 85, 95];
    let x = 44;
    doc.fontSize(header ? 8 : 7.5).fillColor(header ? '#111827' : '#374151');
    cells.forEach((cell, index) => {
      doc.text(String(cell), x, y, { width: widths[index], continued: false });
      x += widths[index];
    });
    doc.moveDown(header ? 0.8 : 0.55);
    if (header) {
      doc.moveTo(44, doc.y).lineTo(550, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.4);
    }
  }
}
