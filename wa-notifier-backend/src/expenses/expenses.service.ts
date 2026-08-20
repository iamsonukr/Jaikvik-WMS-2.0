import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetaService } from '../common/meta.service';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { WhatsAppAccount, WhatsAppAccountDocument } from '../whatsapp-accounts/whatsapp-account.schema';
import { WalletTransaction, WalletTransactionDocument, WalletTransactionType } from '../wallet/wallet-transaction.schema';
import { MetaExpenseSnapshot, MetaExpenseSnapshotDocument, MetaExpenseSource } from './meta-expense.schema';

type Period = 'month' | 'year' | 'all';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(WhatsAppAccount.name) private accountModel: Model<WhatsAppAccountDocument>,
    @InjectModel(WalletTransaction.name) private txnModel: Model<WalletTransactionDocument>,
    @InjectModel(MetaExpenseSnapshot.name) private expenseModel: Model<MetaExpenseSnapshotDocument>,
    private cfg: ConfigService,
    private meta: MetaService,
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

  async syncMetaPricing(period: Period = 'month') {
    const window = this.periodWindow(period);
    const start = window.start || new Date(new Date().getFullYear(), 0, 1);
    const end = window.end;
    const startSeconds = Math.floor(start.getTime() / 1000);
    const endSeconds = Math.floor(end.getTime() / 1000);
    const providerToken = this.cfg.get<string>('META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN');

    const accounts = await this.accountModel
      .find({ tenantId: { $exists: true, $ne: null }, wabaId: { $exists: true, $ne: '' } })
      .select('tenantId name wabaId phoneNumberId accessToken')
      .lean();

    if (!accounts.length) {
      return { synced: 0, failed: 0, skipped: 0, failures: [], summary: await this.adminSummary(period) };
    }

    let synced = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const account of accounts as any[]) {
      const accessToken = providerToken || account.accessToken;
      if (!accessToken) {
        skipped += 1;
        failures.push({ wabaId: account.wabaId, accountName: account.name, message: 'No Meta access token available for this WABA.' });
        continue;
      }

      try {
        const response = await this.meta.getPricingAnalytics(account.wabaId, accessToken, startSeconds, endSeconds, {
          granularity: 'DAILY',
          metricTypes: ['COST', 'VOLUME'],
          dimensions: ['COUNTRY', 'PRICING_CATEGORY', 'PHONE'],
        });
        const metaChargedAmount = this.sumMetaCost(response);
        const currency = this.extractCurrency(response) || this.cfg.get<string>('META_WABA_CURRENCY', 'INR');

        await this.expenseModel.findOneAndUpdate(
          { wabaId: account.wabaId, periodStart: start, periodEnd: end },
          {
            $set: {
              tenantId: account.tenantId,
              whatsappAccountId: account._id,
              wabaId: account.wabaId,
              periodStart: start,
              periodEnd: end,
              metaChargedAmount,
              currency,
              source: MetaExpenseSource.META_API,
              notes: 'Synced from Meta pricing_analytics.',
              rawMetaResponse: response,
              syncedAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        synced += 1;
      } catch (err) {
        failed += 1;
        const message = err?.response?.data?.error?.message || err?.message || 'Unknown Meta pricing sync error';
        failures.push({
          wabaId: account.wabaId,
          accountName: account.name,
          message: this.pricingSyncErrorMessage(message),
        });
      }
    }

    return {
      synced,
      failed,
      skipped,
      failures,
      range: { start, end, startSeconds, endSeconds },
      summary: await this.adminSummary(period),
    };
  }

  private periodWindow(period: Period) {
    const now = new Date();
    const end = now;
    if (period === 'year') return { start: new Date(now.getFullYear(), 0, 1), end };
    if (period === 'all') return { start: null, end };
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  }

  private sumMetaCost(value: any): number {
    const records = this.pricingRecords(value);
    const total = records.reduce((sum, record) => sum + this.costFromRecord(record), 0);
    return Number(total.toFixed(6));
  }

  private pricingRecords(value: any): any[] {
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.pricing_analytics?.data)) return value.pricing_analytics.data;
    if (Array.isArray(value?._embedded?.pricing_analytics)) return value._embedded.pricing_analytics;
    return Array.isArray(value) ? value : [value].filter(Boolean);
  }

  private pricingSyncErrorMessage(message: string) {
    if (/#200|permission|permissions|not have access|does not have access/i.test(message)) {
      return `${message} Provider mode can send messages with MESSAGING, but Meta pricing analytics also requires the provider system user to be assigned ANALYZE on this WABA. Re-run provider assignment or reconnect this client after updating META_WABA_SYSTEM_USER_TASKS.`;
    }
    return message;
  }

  private costFromRecord(record: any): number {
    if (!record || typeof record !== 'object') return 0;
    if (Array.isArray(record.data_points)) {
      return record.data_points.reduce((sum, point) => sum + this.costFromRecord(point), 0);
    }
    if (Array.isArray(record.values)) {
      return record.values.reduce((sum, point) => sum + this.costFromRecord(point), 0);
    }
    const direct = this.numberValue(record.cost ?? record.total_cost ?? record.amount);
    if (direct !== null) return direct;

    return Object.entries(record).reduce((sum, [key, value]) => {
      if (['cost', 'total_cost', 'amount'].includes(key)) return sum + (this.numberValue(value) || 0);
      if (Array.isArray(value)) return sum + value.reduce((inner, item) => inner + this.costFromRecord(item), 0);
      return sum;
    }, 0);
  }

  private numberValue(value: any): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  private extractCurrency(value: any): string | null {
    const records = this.pricingRecords(value);
    for (const record of records) {
      const currency = this.findCurrency(record);
      if (currency) return currency;
    }
    return null;
  }

  private findCurrency(value: any): string | null {
    if (!value || typeof value !== 'object') return null;
    if (typeof value.currency === 'string') return value.currency;
    if (typeof value.currency_code === 'string') return value.currency_code;
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = this.findCurrency(item);
          if (found) return found;
        }
      } else if (child && typeof child === 'object') {
        const found = this.findCurrency(child);
        if (found) return found;
      }
    }
    return null;
  }
}
