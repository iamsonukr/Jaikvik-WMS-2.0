import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { WhatsAppAccount, WhatsAppAccountDocument } from '../whatsapp-accounts/whatsapp-account.schema';
import { WalletTransaction, WalletTransactionDocument, WalletTransactionType } from '../wallet/wallet-transaction.schema';
import { MetaExpenseSnapshot, MetaExpenseSnapshotDocument, MetaExpenseSource } from './meta-expense.schema';
import { Broadcast, BroadcastDocument, BroadcastLog, BroadcastLogDocument } from '../broadcasts/broadcast.schema';
import { Message, MessageDocument } from '../inbox/message.schema';

type Period = 'month' | 'year' | 'all';
type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';

const META_PRICING_PAGE_URL = 'https://whatsappbusiness.com/products/platform-pricing/?country=India&currency=Indian%20Rupee%20(INR)&category=Authentication';
const META_PRICING_FALLBACK: Record<PricingCategory, { quote: number; tierList: Array<{ minVolume: number; maxVolume: number; quote: number }> }> = {
  marketing: { quote: 0.8631, tierList: [] },
  utility: {
    quote: 0.115,
    tierList: [
      { minVolume: 0, maxVolume: 25000000, quote: 0.115 },
      { minVolume: 25000001, maxVolume: 50000000, quote: 0.1081 },
      { minVolume: 50000001, maxVolume: 100000000, quote: 0.1012 },
      { minVolume: 100000001, maxVolume: 200000000, quote: 0.0943 },
      { minVolume: 200000001, maxVolume: 300000000, quote: 0.0874 },
      { minVolume: 300000001, maxVolume: Number.MAX_SAFE_INTEGER, quote: 0.0805 },
    ],
  },
  authentication: {
    quote: 0.115,
    tierList: [
      { minVolume: 0, maxVolume: 750000, quote: 0.115 },
      { minVolume: 750001, maxVolume: 15000000, quote: 0.1081 },
      { minVolume: 15000001, maxVolume: 20000000, quote: 0.1012 },
      { minVolume: 20000001, maxVolume: 50000000, quote: 0.0943 },
      { minVolume: 50000001, maxVolume: 100000000, quote: 0.0874 },
      { minVolume: 100000001, maxVolume: Number.MAX_SAFE_INTEGER, quote: 0.0805 },
    ],
  },
  service: { quote: 0, tierList: [] },
};

@Injectable()
export class ExpensesService {
  private metaPricingCache: { fetchedAt: Date; rates: Record<PricingCategory, any>; source: string; error?: string } | null = null;

  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(WhatsAppAccount.name) private accountModel: Model<WhatsAppAccountDocument>,
    @InjectModel(WalletTransaction.name) private txnModel: Model<WalletTransactionDocument>,
    @InjectModel(MetaExpenseSnapshot.name) private expenseModel: Model<MetaExpenseSnapshotDocument>,
    @InjectModel(Broadcast.name) private broadcastModel: Model<BroadcastDocument>,
    @InjectModel(BroadcastLog.name) private broadcastLogModel: Model<BroadcastLogDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private cfg: ConfigService,
    private meta: MetaService,
    private whatsappAccounts: WhatsAppAccountsService,
  ) {}

  async adminSummary(period: Period = 'month') {
    const window = this.periodWindow(period);
    const dateMatch = window.start ? { createdAt: { $gte: window.start, $lte: window.end } } : {};
    const expenseDateMatch = window.start ? { periodStart: { $lte: window.end }, periodEnd: { $gte: window.start } } : {};
    const metaPricing = await this.currentMetaPricing();

    const [tenants, accounts, revenueRows, expenseRows, expenseSnapshots, expectedRows] = await Promise.all([
      this.tenantModel.find().populate('planId', 'name messageRates').lean(),
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
      this.expenseModel.find(expenseDateMatch).select('tenantId whatsappAccountId wabaId metaChargedAmount currency source metaInvoiceId notes syncedAt updatedAt').lean(),
      this.expectedUsageByTenant(dateMatch),
    ]);

    const accountsByTenant = new Map<string, any[]>();
    accounts.forEach((account) => {
      const tenantId = String(account.tenantId || '');
      if (!tenantId) return;
      if (!accountsByTenant.has(tenantId)) accountsByTenant.set(tenantId, []);
      accountsByTenant.get(tenantId).push(account);
    });
    const expenseByWaba = new Map(
      expenseSnapshots.map((snapshot: any) => [
        String(snapshot.wabaId),
        {
          id: String(snapshot._id),
          amount: Number(snapshot.metaChargedAmount || 0),
          currency: snapshot.currency || 'INR',
          source: snapshot.source || MetaExpenseSource.MANUAL,
          metaInvoiceId: snapshot.metaInvoiceId || '',
          notes: snapshot.notes || '',
          syncedAt: snapshot.syncedAt || snapshot.updatedAt || null,
        },
      ]),
    );

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
    const expectedByTenant = new Map(
      expectedRows.map((row) => {
        const categoryCounts = this.normalizeCategoryCounts(row.categories || {});
        const expectedCost = this.expectedCostBreakdown(categoryCounts, metaPricing.rates);
        return [
          String(row.tenantId),
          {
            expectedMetaCost: expectedCost.total,
            expectedMetaSubtotal: expectedCost.subtotal,
            expectedMetaTax: expectedCost.tax,
            expectedMetaTaxPercent: expectedCost.taxPercent,
            expectedBillableMessages: Object.values(categoryCounts).reduce((sum: number, count: any) => sum + Number(count || 0), 0),
            expectedCategoryCounts: categoryCounts,
          },
        ];
      }),
    );

    const rows = tenants.map((tenant: any) => {
      const tenantId = String(tenant._id);
      const revenue = revenueByTenant.get(tenantId) || { messageDebits: 0, refunds: 0, billableEntries: 0 };
      const expense = expenseByTenant.get(tenantId) || { metaCharged: 0, snapshotCount: 0, latestSyncedAt: null };
      const expected = expectedByTenant.get(tenantId) || {
        expectedMetaCost: 0,
        expectedMetaSubtotal: 0,
        expectedMetaTax: 0,
        expectedMetaTaxPercent: this.metaExpenseTaxPercent(),
        expectedBillableMessages: 0,
        expectedCategoryCounts: this.normalizeCategoryCounts({}),
      };
      const clientRevenue = Number((revenue.messageDebits - revenue.refunds).toFixed(4));
      const hasMetaCost = expense.snapshotCount > 0;
      const metaCharged = Number(expense.metaCharged.toFixed(4));
      const margin = hasMetaCost ? Number((clientRevenue - metaCharged).toFixed(4)) : null;
      const marginPercent = hasMetaCost && clientRevenue > 0 ? Number(((margin / clientRevenue) * 100).toFixed(2)) : null;
      const expectedMargin = Number((clientRevenue - expected.expectedMetaCost).toFixed(4));
      const expectedMarginPercent = clientRevenue > 0 ? Number(((expectedMargin / clientRevenue) * 100).toFixed(2)) : null;
      const tenantAccounts = accountsByTenant.get(tenantId) || [];

      return {
        tenantId,
        clientName: tenant.name,
        contactEmail: tenant.contactEmail,
        status: tenant.status,
        planName: tenant.planId?.name || null,
        planMessageRates: this.normalizePlanRates(tenant.planId?.messageRates || {}),
        accounts: tenantAccounts.map((account) => ({
          id: String(account._id),
          name: account.name,
          wabaId: account.wabaId,
          phoneNumberId: account.phoneNumberId,
          phone: account.phone,
          isActive: account.isActive !== false,
          metaCostSnapshot: expenseByWaba.get(String(account.wabaId)) || null,
        })),
        clientRevenue,
        messageDebits: Number(revenue.messageDebits.toFixed(4)),
        refunds: Number(revenue.refunds.toFixed(4)),
        billableEntries: revenue.billableEntries,
        metaCharged,
        hasMetaCost,
        expectedMetaCost: expected.expectedMetaCost,
        expectedMetaSubtotal: expected.expectedMetaSubtotal,
        expectedMetaTax: expected.expectedMetaTax,
        expectedMetaTaxPercent: expected.expectedMetaTaxPercent,
        expectedBillableMessages: expected.expectedBillableMessages,
        expectedCategoryCounts: expected.expectedCategoryCounts,
        margin,
        marginPercent,
        expectedMargin,
        expectedMarginPercent,
        latestMetaSyncAt: expense.latestSyncedAt,
      };
    });

    const totals = rows.reduce((acc, row) => {
      acc.clientRevenue += row.clientRevenue;
      acc.messageDebits += row.messageDebits;
      acc.refunds += row.refunds;
      acc.metaCharged += row.hasMetaCost ? row.metaCharged : 0;
      acc.expectedMetaCost += row.expectedMetaCost;
      acc.expectedMetaSubtotal += row.expectedMetaSubtotal;
      acc.expectedMetaTax += row.expectedMetaTax;
      acc.billableEntries += row.billableEntries;
      acc.expectedBillableMessages += row.expectedBillableMessages;
      acc.connectedWabas += row.accounts.length;
      if (!row.hasMetaCost && (row.clientRevenue > 0 || row.accounts.length > 0)) acc.unsyncedClients += 1;
      return acc;
    }, {
      clientRevenue: 0,
      messageDebits: 0,
      refunds: 0,
      metaCharged: 0,
      expectedMetaCost: 0,
      expectedMetaSubtotal: 0,
      expectedMetaTax: 0,
      billableEntries: 0,
      expectedBillableMessages: 0,
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
        expectedMetaCost: Number(totals.expectedMetaCost.toFixed(4)),
        expectedMetaSubtotal: Number(totals.expectedMetaSubtotal.toFixed(4)),
        expectedMetaTax: Number(totals.expectedMetaTax.toFixed(4)),
        expectedMetaTaxPercent: this.metaExpenseTaxPercent(),
        knownMargin: Number((totals.clientRevenue - totals.metaCharged).toFixed(4)),
        expectedMargin: Number((totals.clientRevenue - totals.expectedMetaCost).toFixed(4)),
      },
      metaPricing,
      rows,
    };
  }

  async saveManualMetaCost(period: Period, dto: any) {
    if (period === 'all') {
      throw new BadRequestException('Manual Meta cost entry is available for this month or this year, not all time.');
    }
    const amount = Number(dto?.metaChargedAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Meta cost amount must be a valid non-negative number.');
    }

    const tenantId = String(dto?.tenantId || '').trim();
    const accountId = String(dto?.whatsappAccountId || dto?.accountId || '').trim();
    if (!tenantId || !accountId) {
      throw new BadRequestException('Client and WhatsApp account are required.');
    }

    const account = await this.accountModel.findOne({ _id: accountId, tenantId }).select('tenantId wabaId _id').lean();
    if (!account) throw new NotFoundException('WhatsApp account not found for this client.');

    const window = this.periodWindow(period);
    await this.expenseModel.findOneAndUpdate(
      { wabaId: account.wabaId, periodStart: window.start, periodEnd: window.end },
      {
        $set: {
          tenantId: account.tenantId,
          whatsappAccountId: account._id,
          wabaId: account.wabaId,
          periodStart: window.start,
          periodEnd: window.end,
          metaChargedAmount: Number(amount.toFixed(4)),
          currency: dto?.currency || 'INR',
          source: MetaExpenseSource.MANUAL,
          metaInvoiceId: String(dto?.metaInvoiceId || '').trim(),
          notes: String(dto?.notes || '').trim(),
          rawMetaResponse: undefined,
          syncedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return { saved: true, summary: await this.adminSummary(period) };
  }

  async adminClientDetail(period: Period, tenantId: string, accountId?: string) {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) throw new BadRequestException('Client is required.');

    const tenant = await this.tenantModel.findById(normalizedTenantId).select('name contactEmail status').lean();
    if (!tenant) throw new NotFoundException('Client not found.');

    const accounts = await this.accountModel
      .find({ tenantId: normalizedTenantId, isRemoved: { $ne: true } })
      .select('name wabaId phoneNumberId phone isActive')
      .sort({ name: 1 })
      .lean();
    const selectedAccounts = accountId ? accounts.filter((account: any) => String(account._id) === accountId) : accounts;
    if (accountId && !selectedAccounts.length) throw new NotFoundException('WhatsApp account not found for this client.');

    const window = this.periodWindow(period);
    const dateMatch = window.start ? { createdAt: { $gte: window.start, $lte: window.end } } : {};
    const expenseDateMatch = window.start ? { periodStart: { $lte: window.end }, periodEnd: { $gte: window.start } } : {};
    const selectedAccountIds = selectedAccounts.map((account: any) => account._id);
    const selectedWabaIds = selectedAccounts.map((account: any) => account.wabaId).filter(Boolean);
    const accountById = new Map(selectedAccounts.map((account: any) => [String(account._id), account]));
    const metaPricing = await this.currentMetaPricing();

    const [broadcasts, expenseSnapshots] = await Promise.all([
      selectedAccountIds.length
        ? this.broadcastModel.find({
          tenantId: normalizedTenantId,
          whatsappAccountId: { $in: selectedAccountIds },
          ...dateMatch,
        }).select('name templateName status whatsappAccountId totalCount sentCount deliveredCount readCount failedCount canceledCount messageCategory appliedUnitPrice appliedTaxPercent reservedAmount createdAt startedAt completedAt').sort({ createdAt: -1 }).lean()
        : [],
      selectedWabaIds.length
        ? this.expenseModel.find({ wabaId: { $in: selectedWabaIds }, ...expenseDateMatch })
          .select('whatsappAccountId wabaId metaChargedAmount currency source metaInvoiceId notes syncedAt updatedAt periodStart periodEnd').lean()
        : [],
    ]);

    const broadcastIds = broadcasts.map((broadcast: any) => broadcast._id);
    const broadcastIdStrings = broadcastIds.map(String);
    const [logRows, transactionRows] = broadcastIds.length ? await Promise.all([
      this.broadcastLogModel.aggregate([
        { $match: { broadcastId: { $in: broadcastIds }, status: { $in: ['delivered', 'read'] }, ...dateMatch } },
        { $group: {
          _id: { broadcastId: '$broadcastId', category: '$messageCategory' },
          count: { $sum: 1 },
          averageUnitPrice: { $avg: '$appliedUnitPrice' },
          averageTaxPercent: { $avg: '$appliedTaxPercent' },
        } },
      ]),
      this.txnModel.aggregate([
        { $match: {
          tenantId: (tenant as any)._id,
          type: { $in: [WalletTransactionType.CAMPAIGN_RESERVATION, WalletTransactionType.MESSAGE_DEBIT, WalletTransactionType.REFUND] },
          $or: [{ campaignId: { $in: broadcastIds } }, { referenceId: { $in: broadcastIdStrings } }],
          ...dateMatch,
        } },
        { $group: {
          _id: { $ifNull: ['$campaignId', '$referenceId'] },
          debits: { $sum: { $cond: [{ $in: ['$type', [WalletTransactionType.CAMPAIGN_RESERVATION, WalletTransactionType.MESSAGE_DEBIT]] }, '$debitAmount', 0] } },
          refunds: { $sum: { $cond: [{ $eq: ['$type', WalletTransactionType.REFUND] }, '$creditAmount', 0] } },
          transactionCount: { $sum: 1 },
          latestTransactionAt: { $max: '$createdAt' },
        } },
      ]),
    ]) : [[], []];

    const logsByBroadcast = new Map<string, any[]>();
    logRows.forEach((row: any) => {
      const id = String(row._id.broadcastId);
      if (!logsByBroadcast.has(id)) logsByBroadcast.set(id, []);
      logsByBroadcast.get(id).push(row);
    });
    const transactionsByBroadcast = new Map(transactionRows.map((row: any) => [String(row._id), row]));

    const broadcastRows = broadcasts.map((broadcast: any) => {
      const id = String(broadcast._id);
      const logs = logsByBroadcast.get(id) || [];
      const categoryCounts = this.normalizeCategoryCounts({});
      let calculatedClientSpend = 0;
      logs.forEach((row: any) => {
        const category = this.normalizePricingCategory(row._id.category || broadcast.messageCategory);
        const count = Number(row.count || 0);
        categoryCounts[category] += count;
        calculatedClientSpend += count * Number(row.averageUnitPrice || broadcast.appliedUnitPrice || 0)
          * (1 + Number(row.averageTaxPercent || broadcast.appliedTaxPercent || 0) / 100);
      });
      const transaction = transactionsByBroadcast.get(id);
      const debits = Number(transaction?.debits || 0);
      const refunds = Number(transaction?.refunds || 0);
      const clientSpend = transaction ? debits - refunds : calculatedClientSpend;
      const expectedCost = this.expectedCostBreakdown(categoryCounts, metaPricing.rates);
      const account: any = accountById.get(String(broadcast.whatsappAccountId));
      return {
        id,
        name: broadcast.name,
        templateName: broadcast.templateName,
        status: broadcast.status,
        accountId: String(broadcast.whatsappAccountId),
        accountName: account?.name || 'Unknown account',
        wabaId: account?.wabaId || '',
        totalCount: Number(broadcast.totalCount || 0),
        sentCount: Number(broadcast.sentCount || 0),
        deliveredCount: Number(broadcast.deliveredCount || 0),
        readCount: Number(broadcast.readCount || 0),
        failedCount: Number(broadcast.failedCount || 0),
        canceledCount: Number(broadcast.canceledCount || 0),
        billableMessages: Object.values(categoryCounts).reduce((sum, count) => sum + count, 0),
        categoryCounts,
        messageCategory: this.normalizePricingCategory(broadcast.messageCategory),
        appliedUnitPrice: Number(broadcast.appliedUnitPrice || 0),
        taxPercent: Number(broadcast.appliedTaxPercent || 0),
        reservedAmount: Number(broadcast.reservedAmount || 0),
        walletDebits: Number(debits.toFixed(4)),
        refunds: Number(refunds.toFixed(4)),
        clientSpend: Number(clientSpend.toFixed(4)),
        expectedMetaSubtotal: expectedCost.subtotal,
        expectedMetaTax: expectedCost.tax,
        expectedMetaTaxPercent: expectedCost.taxPercent,
        expectedMetaCost: expectedCost.total,
        expectedMargin: Number((clientSpend - expectedCost.total).toFixed(4)),
        transactionCount: Number(transaction?.transactionCount || 0),
        latestTransactionAt: transaction?.latestTransactionAt || null,
        createdAt: broadcast.createdAt,
        startedAt: broadcast.startedAt || null,
        completedAt: broadcast.completedAt || null,
      };
    });

    const expenseByAccount = new Map<string, any[]>();
    const expenseByWaba = new Map<string, any[]>();
    expenseSnapshots.forEach((snapshot: any) => {
      const id = String(snapshot.whatsappAccountId || '');
      if (id) {
        if (!expenseByAccount.has(id)) expenseByAccount.set(id, []);
        expenseByAccount.get(id).push(snapshot);
      }
      const wabaId = String(snapshot.wabaId || '');
      if (!expenseByWaba.has(wabaId)) expenseByWaba.set(wabaId, []);
      expenseByWaba.get(wabaId).push(snapshot);
    });
    const accountRows = selectedAccounts.map((account: any) => {
      const snapshots = expenseByAccount.get(String(account._id)) || expenseByWaba.get(String(account.wabaId)) || [];
      return {
        id: String(account._id), name: account.name, wabaId: account.wabaId,
        phoneNumberId: account.phoneNumberId, phone: account.phone, isActive: account.isActive !== false,
        metaCharged: Number(snapshots.reduce((sum, snapshot) => sum + Number(snapshot.metaChargedAmount || 0), 0).toFixed(4)),
        snapshots: snapshots.map((snapshot) => ({
          id: String(snapshot._id), amount: Number(snapshot.metaChargedAmount || 0), currency: snapshot.currency || 'INR',
          source: snapshot.source, metaInvoiceId: snapshot.metaInvoiceId || '', notes: snapshot.notes || '',
          periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, syncedAt: snapshot.syncedAt || snapshot.updatedAt,
        })),
      };
    });
    const totals = broadcastRows.reduce((acc, row) => {
      acc.clientSpend += row.clientSpend;
      acc.walletDebits += row.walletDebits;
      acc.refunds += row.refunds;
      acc.reservedAmount += row.reservedAmount;
      acc.expectedMetaCost += row.expectedMetaCost;
      acc.expectedMetaSubtotal += row.expectedMetaSubtotal;
      acc.expectedMetaTax += row.expectedMetaTax;
      acc.billableMessages += row.billableMessages;
      return acc;
    }, { clientSpend: 0, walletDebits: 0, refunds: 0, reservedAmount: 0, expectedMetaCost: 0, expectedMetaSubtotal: 0, expectedMetaTax: 0, billableMessages: 0 });

    return {
      period, start: window.start, end: window.end,
      client: { id: String((tenant as any)._id), name: (tenant as any).name, contactEmail: (tenant as any).contactEmail, status: (tenant as any).status },
      selectedAccountId: accountId || 'all', accounts: accountRows, metaPricing,
      totals: {
        ...totals,
        clientSpend: Number(totals.clientSpend.toFixed(4)), walletDebits: Number(totals.walletDebits.toFixed(4)),
        refunds: Number(totals.refunds.toFixed(4)), reservedAmount: Number(totals.reservedAmount.toFixed(4)),
        expectedMetaCost: Number(totals.expectedMetaCost.toFixed(4)),
        expectedMetaSubtotal: Number(totals.expectedMetaSubtotal.toFixed(4)),
        expectedMetaTax: Number(totals.expectedMetaTax.toFixed(4)),
        expectedMetaTaxPercent: this.metaExpenseTaxPercent(),
        expectedMargin: Number((totals.clientSpend - totals.expectedMetaCost).toFixed(4)),
        actualMetaCharged: Number(accountRows.reduce((sum, account) => sum + account.metaCharged, 0).toFixed(4)),
        broadcastCount: broadcastRows.length,
      },
      broadcasts: broadcastRows,
    };
  }

  private async expectedUsageByTenant(dateMatch: Record<string, any>) {
    const broadcastMatch = {
      ...dateMatch,
      tenantId: { $exists: true, $ne: null },
      status: { $in: ['delivered', 'read'] },
    };
    const directMessageMatch = {
      ...dateMatch,
      tenantId: { $exists: true, $ne: null },
      direction: 'outbound',
      deliveryStatus: { $in: ['delivered', 'read'] },
      messageCategory: { $exists: true, $ne: null },
    };

    const [broadcastRows, messageRows] = await Promise.all([
      this.broadcastLogModel.aggregate([
        { $match: broadcastMatch },
        { $group: { _id: { tenantId: '$tenantId', category: '$messageCategory' }, count: { $sum: 1 } } },
      ]),
      this.messageModel.aggregate([
        { $match: directMessageMatch },
        { $group: { _id: { tenantId: '$tenantId', category: '$messageCategory' }, count: { $sum: 1 } } },
      ]),
    ]);

    const byTenant = new Map<string, { tenantId: string; categories: Record<string, number> }>();
    [...broadcastRows, ...messageRows].forEach((row: any) => {
      const tenantId = String(row?._id?.tenantId || '');
      if (!tenantId) return;
      const category = this.normalizePricingCategory(row?._id?.category);
      if (!byTenant.has(tenantId)) byTenant.set(tenantId, { tenantId, categories: {} });
      const record = byTenant.get(tenantId);
      record.categories[category] = Number(record.categories[category] || 0) + Number(row.count || 0);
    });

    return Array.from(byTenant.values());
  }

  private async currentMetaPricing() {
    if (this.metaPricingCache && Date.now() - this.metaPricingCache.fetchedAt.getTime() < 6 * 60 * 60 * 1000) {
      return this.metaPricingCache;
    }

    try {
      const page = await axios.get('https://whatsappbusiness.com/products/platform-pricing/', { timeout: 8000 });
      const restUrl = this.extractString(page.data, /"restUrl":"([^"]+)"/);
      const restNonce = this.extractString(page.data, /"restNonce":"([^"]+)"/);
      const wpNonce = this.extractString(page.data, /"wpNonce":"([^"]+)"/);
      if (!restUrl || !restNonce || !wpNonce) throw new Error('Could not read pricing endpoint tokens from WhatsApp pricing page.');

      const rates = {} as Record<PricingCategory, any>;
      await Promise.all((['marketing', 'utility', 'authentication', 'service'] as PricingCategory[]).map(async (category) => {
        const response = await axios.get(restUrl.replace(/\\\//g, '/'), {
          timeout: 8000,
          headers: { 'X-WP-Nonce': wpNonce },
          params: {
            market: 'IN',
            currency: 'INR',
            category: this.metaPricingCategoryParam(category),
            _wab_nonce: restNonce,
          },
        });
        rates[category] = this.normalizeMetaRate(response.data);
      }));

      this.metaPricingCache = {
        fetchedAt: new Date(),
        rates,
        source: META_PRICING_PAGE_URL,
      };
    } catch (err) {
      this.metaPricingCache = {
        fetchedAt: new Date(),
        rates: META_PRICING_FALLBACK,
        source: META_PRICING_PAGE_URL,
        error: err?.message || 'Could not fetch current WhatsApp pricing; using bundled fallback rates.',
      };
    }

    return this.metaPricingCache;
  }

  private extractString(value: string, pattern: RegExp) {
    const match = String(value || '').match(pattern);
    return match?.[1]?.replace(/\\\//g, '/') || '';
  }

  private normalizeMetaRate(value: any) {
    return {
      quote: Number(value?.quote || 0),
      tierList: Array.isArray(value?.tier_list)
        ? value.tier_list.map((tier) => ({
          minVolume: Number(tier.min_volume || 0),
          maxVolume: Math.min(Number(tier.max_volume || Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER),
          quote: Number(tier.quote || 0),
        }))
        : [],
    };
  }

  private metaPricingCategoryParam(category: PricingCategory) {
    const labels: Record<PricingCategory, string> = {
      marketing: 'Marketing',
      utility: 'Utility',
      authentication: 'Authentication',
      service: 'Service',
    };
    return labels[category];
  }

  private normalizeCategoryCounts(value: Record<string, number>) {
    return (['marketing', 'utility', 'authentication', 'service'] as PricingCategory[]).reduce((acc, category) => {
      acc[category] = Number(value?.[category] || 0);
      return acc;
    }, {} as Record<PricingCategory, number>);
  }

  private normalizePlanRates(value: Record<string, any>) {
    return (['marketing', 'utility', 'authentication', 'service'] as PricingCategory[]).reduce((acc, category) => {
      acc[category] = Number(value?.[category] || 0);
      return acc;
    }, {} as Record<PricingCategory, number>);
  }

  private normalizePricingCategory(category: any): PricingCategory {
    const value = String(category || '').trim().toLowerCase();
    if (value.includes('auth')) return 'authentication';
    if (value.includes('util')) return 'utility';
    if (value.includes('service')) return 'service';
    return 'marketing';
  }

  private expectedCostForCategories(categoryCounts: Record<PricingCategory, number>, rates: Record<PricingCategory, any>) {
    const total = (Object.entries(categoryCounts) as Array<[PricingCategory, number]>).reduce((sum, [category, count]) => {
      return sum + this.expectedCostForCategory(count, rates[category]);
    }, 0);
    return Number(total.toFixed(4));
  }

  private metaExpenseTaxPercent() {
    const configured = Number(this.cfg.get<string>('META_EXPENSE_TAX_PERCENT', '18'));
    return Number.isFinite(configured) && configured >= 0 ? configured : 18;
  }

  private expectedCostBreakdown(categoryCounts: Record<PricingCategory, number>, rates: Record<PricingCategory, any>) {
    const subtotal = this.expectedCostForCategories(categoryCounts, rates);
    const taxPercent = this.metaExpenseTaxPercent();
    const tax = Number((subtotal * taxPercent / 100).toFixed(4));
    return { subtotal, tax, taxPercent, total: Number((subtotal + tax).toFixed(4)) };
  }

  private expectedCostForCategory(count: number, rate: { quote: number; tierList: Array<{ minVolume: number; maxVolume: number; quote: number }> }) {
    const messageCount = Number(count || 0);
    if (messageCount <= 0) return 0;
    const tiers = Array.isArray(rate?.tierList) ? rate.tierList : [];
    if (!tiers.length) return messageCount * Number(rate?.quote || 0);

    return tiers.reduce((sum, tier) => {
      const from = Number(tier.minVolume || 0);
      const to = Number(tier.maxVolume || Number.MAX_SAFE_INTEGER);
      const lowerBound = from <= 0 ? 1 : from;
      if (messageCount < lowerBound) return sum;
      const messagesInTier = Math.max(0, Math.min(messageCount, to) - lowerBound + 1);
      return sum + messagesInTier * Number(tier.quote || 0);
    }, 0);
  }

  async syncMetaPricing(period: Period = 'month') {
    const window = this.periodWindow(period);
    const start = window.start || new Date(new Date().getFullYear(), 0, 1);
    const end = window.end;
    const startSeconds = Math.floor(start.getTime() / 1000);
    const endSeconds = Math.floor(end.getTime() / 1000);

    const accounts = await this.accountModel
      .find({ tenantId: { $exists: true, $ne: null }, wabaId: { $exists: true, $ne: '' }, isRemoved: { $ne: true } })
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
      let accessToken = '';
      try {
        accessToken = this.whatsappAccounts.getOperationalAccessToken(account, 'pricing analytics');
      } catch (err) {
        failed += 1;
        failures.push({
          wabaId: account.wabaId,
          accountName: account.name,
          message: err?.message || 'Could not resolve a Meta access token for this WABA.',
        });
        continue;
      }

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
      return `${message} Provider mode can send messages with MESSAGING, but Meta pricing analytics also requires the provider system user to be assigned VIEW_COST on this WABA. Re-run provider assignment or reconnect this client after updating META_WABA_SYSTEM_USER_TASKS.`;
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
