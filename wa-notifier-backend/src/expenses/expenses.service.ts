import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { WhatsAppAccount, WhatsAppAccountDocument } from '../whatsapp-accounts/whatsapp-account.schema';
import { WalletTransaction, WalletTransactionDocument, WalletTransactionType } from '../wallet/wallet-transaction.schema';
import { MetaExpenseSnapshot, MetaExpenseSnapshotDocument } from './meta-expense.schema';

type Period = 'month' | 'year' | 'all';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(WhatsAppAccount.name) private accountModel: Model<WhatsAppAccountDocument>,
    @InjectModel(WalletTransaction.name) private txnModel: Model<WalletTransactionDocument>,
    @InjectModel(MetaExpenseSnapshot.name) private expenseModel: Model<MetaExpenseSnapshotDocument>,
  ) {}

  async adminSummary(period: Period = 'month') {
    const window = this.periodWindow(period);
    const dateMatch = window.start ? { createdAt: { $gte: window.start, $lte: window.end } } : {};
    const expenseDateMatch = window.start ? { periodStart: { $lte: window.end }, periodEnd: { $gte: window.start } } : {};

    const [tenants, accounts, revenueRows, expenseRows] = await Promise.all([
      this.tenantModel.find().populate('planId', 'name').lean(),
      this.accountModel.find().select('tenantId name wabaId phoneNumberId phone onboardingMode isActive').lean(),
      this.txnModel.aggregate([
        {
          $match: {
            ...dateMatch,
            type: {
              $in: [
                WalletTransactionType.MESSAGE_DEBIT,
                WalletTransactionType.CAMPAIGN_RESERVATION,
                WalletTransactionType.REFUND,
              ],
            },
          },
        },
        {
          $group: {
            _id: '$tenantId',
            messageDebits: {
              $sum: {
                $cond: [
                  { $in: ['$type', [WalletTransactionType.MESSAGE_DEBIT, WalletTransactionType.CAMPAIGN_RESERVATION]] },
                  '$debitAmount',
                  0,
                ],
              },
            },
            refunds: {
              $sum: {
                $cond: [{ $eq: ['$type', WalletTransactionType.REFUND] }, '$creditAmount', 0],
              },
            },
            billableEntries: {
              $sum: {
                $cond: [
                  { $in: ['$type', [WalletTransactionType.MESSAGE_DEBIT, WalletTransactionType.CAMPAIGN_RESERVATION]] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.expenseModel.aggregate([
        { $match: expenseDateMatch },
        {
          $group: {
            _id: '$tenantId',
            metaCharged: { $sum: '$metaChargedAmount' },
            snapshotCount: { $sum: 1 },
            latestSyncedAt: { $max: { $ifNull: ['$syncedAt', '$updatedAt'] } },
          },
        },
      ]),
    ]);

    const accountsByTenant = new Map<string, any[]>();
    accounts.forEach((account) => {
      const tenantId = String(account.tenantId || '');
      if (!tenantId) return;
      if (!accountsByTenant.has(tenantId)) accountsByTenant.set(tenantId, []);
      accountsByTenant.get(tenantId).push(account);
    });

    const revenueByTenant = new Map(
      revenueRows.map((row) => [
        String(row._id),
        {
          messageDebits: Number(row.messageDebits || 0),
          refunds: Number(row.refunds || 0),
          billableEntries: Number(row.billableEntries || 0),
        },
      ]),
    );
    const expenseByTenant = new Map(
      expenseRows.map((row) => [
        String(row._id),
        {
          metaCharged: Number(row.metaCharged || 0),
          snapshotCount: Number(row.snapshotCount || 0),
          latestSyncedAt: row.latestSyncedAt || null,
        },
      ]),
    );

    const rows = tenants.map((tenant: any) => {
      const tenantId = String(tenant._id);
      const revenue = revenueByTenant.get(tenantId) || { messageDebits: 0, refunds: 0, billableEntries: 0 };
      const expense = expenseByTenant.get(tenantId) || { metaCharged: 0, snapshotCount: 0, latestSyncedAt: null };
      const clientRevenue = Number((revenue.messageDebits - revenue.refunds).toFixed(4));
      const hasMetaCost = expense.snapshotCount > 0;
      const metaCharged = Number(expense.metaCharged.toFixed(4));
      const margin = hasMetaCost ? Number((clientRevenue - metaCharged).toFixed(4)) : null;
      const marginPercent = hasMetaCost && clientRevenue > 0 ? Number(((margin / clientRevenue) * 100).toFixed(2)) : null;
      const tenantAccounts = accountsByTenant.get(tenantId) || [];

      return {
        tenantId,
        clientName: tenant.name,
        contactEmail: tenant.contactEmail,
        status: tenant.status,
        planName: tenant.planId?.name || null,
        accounts: tenantAccounts.map((account) => ({
          id: String(account._id),
          name: account.name,
          wabaId: account.wabaId,
          phoneNumberId: account.phoneNumberId,
          phone: account.phone,
          isActive: account.isActive !== false,
        })),
        clientRevenue,
        messageDebits: Number(revenue.messageDebits.toFixed(4)),
        refunds: Number(revenue.refunds.toFixed(4)),
        billableEntries: revenue.billableEntries,
        metaCharged,
        hasMetaCost,
        margin,
        marginPercent,
        latestMetaSyncAt: expense.latestSyncedAt,
      };
    });

    const totals = rows.reduce((acc, row) => {
      acc.clientRevenue += row.clientRevenue;
      acc.messageDebits += row.messageDebits;
      acc.refunds += row.refunds;
      acc.metaCharged += row.hasMetaCost ? row.metaCharged : 0;
      acc.billableEntries += row.billableEntries;
      acc.connectedWabas += row.accounts.length;
      if (!row.hasMetaCost && (row.clientRevenue > 0 || row.accounts.length > 0)) acc.unsyncedClients += 1;
      return acc;
    }, {
      clientRevenue: 0,
      messageDebits: 0,
      refunds: 0,
      metaCharged: 0,
      billableEntries: 0,
      connectedWabas: 0,
      unsyncedClients: 0,
    });

    return {
      period,
      start: window.start,
      end: window.end,
      totals: {
        ...totals,
        clientRevenue: Number(totals.clientRevenue.toFixed(4)),
        messageDebits: Number(totals.messageDebits.toFixed(4)),
        refunds: Number(totals.refunds.toFixed(4)),
        metaCharged: Number(totals.metaCharged.toFixed(4)),
        knownMargin: Number((totals.clientRevenue - totals.metaCharged).toFixed(4)),
      },
      rows,
    };
  }

  private periodWindow(period: Period) {
    const now = new Date();
    const end = now;
    if (period === 'year') return { start: new Date(now.getFullYear(), 0, 1), end };
    if (period === 'all') return { start: null, end };
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  }
}
