import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Broadcast, BroadcastDocument, BroadcastLog, BroadcastLogDocument } from './broadcast.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { ContactsService } from '../contacts/contacts.service';
import { TemplatesService } from '../templates/templates.service';
import { WalletService } from '../wallet/wallet.service';
import { MessageCategory } from '../common/enums/message-category.enum';
import { resolveWhatsAppAccountId, toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { Plan, PlanDocument } from '../plans/plan.schema';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const TERMINAL_BROADCAST_STATUSES = new Set(['done', 'failed', 'canceled']);
const ACTIVE_BROADCAST_STATUSES = new Set(['running', 'scheduled']);

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    @InjectModel(Broadcast.name)    private broadcastModel: Model<BroadcastDocument>,
    @InjectModel(BroadcastLog.name) private logModel: Model<BroadcastLogDocument>,
    private meta: MetaService,
    private clients: WhatsAppAccountsService,
    private contacts: ContactsService,
    private templates: TemplatesService,
    private wallet: WalletService,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
  ) {}

  findAll(whatsappAccountId: string) {
    return this.broadcastModel.aggregate([
      { $match: this.whatsappAccountIdQuery(whatsappAccountId) },
      { $sort: { createdAt: -1 } },
    ]);
  }

  findOne(id: string) { return this.broadcastModel.findById(id); }

  async create(dto: Omit<Partial<Broadcast>, 'whatsappAccountId' | 'scheduledAt'> & { whatsappAccountId?: string; clientId?: string; scheduledAt?: string | Date }) {
    // Stamp tenantId at creation time (not just at send time) so the field
    // is always populated for reporting/filtering, matching every other
    // tenant-scoped collection in the schema.
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    const status = scheduledAt ? 'scheduled' : this.normalizeBroadcastStatus(dto.status || 'draft');
    if (status === 'scheduled' && !scheduledAt) throw new BadRequestException('Scheduled campaigns require a scheduled date.');
    if (scheduledAt && scheduledAt <= new Date()) throw new BadRequestException('Schedule date must be in the future.');
    if (!['draft', 'scheduled'].includes(status)) throw new BadRequestException('New campaigns can only be saved as draft or scheduled.');
    return this.broadcastModel.create({
      ...dto,
      status,
      scheduledAt,
      whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
      tenantId: account?.tenantId,
    });
  }

  async update(id: string, dto: Omit<Partial<Broadcast>, 'scheduledAt'> & { scheduledAt?: string | Date }) {
    const existing = await this.broadcastModel.findById(id);
    if (!existing) throw new NotFoundException();
    if (ACTIVE_BROADCAST_STATUSES.has(existing.status)) {
      throw new BadRequestException('Pause or cancel this campaign before editing it.');
    }
    if (TERMINAL_BROADCAST_STATUSES.has(existing.status)) {
      throw new BadRequestException('Completed or canceled campaigns cannot be edited. Duplicate it to make changes.');
    }

    const next: any = { ...dto };
    if (dto.scheduledAt !== undefined) next.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt as any) : null;
    if (dto.status !== undefined) next.status = this.normalizeBroadcastStatus(dto.status);
    if (next.scheduledAt && next.status === 'draft') next.status = 'scheduled';
    if (next.status === 'scheduled' && !next.scheduledAt && !existing.scheduledAt) {
      throw new BadRequestException('Scheduled campaigns require a scheduled date.');
    }
    if (next.scheduledAt && next.scheduledAt <= new Date()) throw new BadRequestException('Schedule date must be in the future.');

    return this.broadcastModel.findByIdAndUpdate(id, next, { new: true });
  }

  logs(broadcastId: string) {
    return this.logModel.find({ broadcastId: toObjectId(broadcastId, 'broadcastId') }).sort({ createdAt: -1 }).limit(1000);
  }

  /**
   * What the client sees before confirming a send: recipient count, price
   * per message, estimated tax/total, current wallet balance, and balance
   * after sending. This must call the same resolver `send()` uses — the
   * frontend never computes cost itself.
   */
  async estimate(broadcastId: string) {
    const broadcast = await this.broadcastModel.findById(broadcastId);
    if (!broadcast) throw new NotFoundException();

    const whatsappAccountId = this.accountIdOf(broadcast);
    const account = await this.clients.findOne(whatsappAccountId);
    const tenantId = toObjectId(broadcast.tenantId || account.tenantId, 'tenantId');
    const contacts = await this.contacts.findBySegment(whatsappAccountId, broadcast.targetTags);
    const category = await this.resolveCategory(broadcast);
    const price = await this.resolvePlanPrice(String(tenantId), category);
    const walletBalance = await this.wallet.getBalance(tenantId);

    const recipients = contacts.length;
    const subtotal = Number((price.sellingPrice * recipients).toFixed(4));
    const tax = Number((subtotal * (price.taxPercent / 100)).toFixed(4));
    const total = Number((subtotal + tax).toFixed(4));

    return {
      messageCategory: category,
      recipients,
      pricePerMessage: price.sellingPrice,
      currency: price.currency,
      estimatedSubtotal: subtotal,
      estimatedTax: tax,
      estimatedTotal: total,
      currentBalance: walletBalance.balance,
      balanceAfterSending: Number((walletBalance.balance - total).toFixed(4)),
      sufficientBalance: walletBalance.balance >= total,
    };
  }

  /**
   * Synchronous half of sending: validates state, resolves pricing, and
   * reserves the wallet balance. Throws immediately (e.g. insufficient
   * balance) so the caller sees the failure right away — this must NOT run
   * inside the fire-and-forget background loop, or a blocked send would
   * silently do nothing instead of surfacing an error to the client.
   */
  async prepareSend(broadcastId: string) {
    const broadcast = await this.broadcastModel.findById(broadcastId);
    if (!broadcast) throw new NotFoundException();
    if (['running', 'done', 'canceled'].includes(broadcast.status)) {
      throw new Error(`Broadcast is already ${broadcast.status}`);
    }

    const whatsappAccountId = this.accountIdOf(broadcast);
    const account = await this.clients.findOne(whatsappAccountId);
    const tenantId = toObjectId(broadcast.tenantId || account.tenantId, 'tenantId');
    const contacts = await this.contacts.findBySegment(whatsappAccountId, broadcast.targetTags);
    const category = await this.resolveCategory(broadcast);
    const price = await this.resolvePlanPrice(String(tenantId), category);

    const totalCost = Number(
      (price.sellingPrice * contacts.length * (1 + price.taxPercent / 100)).toFixed(4),
    );

    const existingLogs = await this.logModel.countDocuments({ broadcastId: broadcast._id });
    const existingReservation = Number(broadcast.reservedAmount || 0) > 0;

    // Reserve the full estimated cost once before a single message goes out.
    // Paused campaigns resume against the original reservation and queued logs.
    const reservation =
      totalCost > 0 && !existingReservation
        ? await this.wallet.reserveForCampaign(tenantId, totalCost, {
            description: `Reserved for campaign "${broadcast.name}" (${contacts.length} recipients)`,
            referenceId: String(broadcast._id),
            campaignId: String(broadcast._id),
            messageCategory: category,
            appliedUnitPrice: price.sellingPrice,
            tax: price.taxPercent,
          })
        : null;

    await this.broadcastModel.findByIdAndUpdate(broadcastId, {
      status: 'running',
      totalCount: contacts.length,
      tenantId,
      messageCategory: category,
      appliedUnitPrice: price.sellingPrice,
      appliedTaxPercent: price.taxPercent,
      reservedAmount: existingReservation ? broadcast.reservedAmount : totalCost,
      reservationTxnId: reservation?._id || broadcast.reservationTxnId,
      startedAt: broadcast.startedAt || new Date(),
    });

    // Create log entries — each stamped with the price applied to it, so
    // historical reports stay correct even after pricing changes later.
    if (existingLogs === 0) {
      const logs = contacts.map(c => ({
        broadcastId: broadcast._id,
        whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
        tenantId,
        phone: c.phone,
        contactName: c.name,
        status: 'queued',
        messageCategory: category,
        appliedUnitPrice: price.sellingPrice,
        appliedTaxPercent: price.taxPercent,
      }));
      if (logs.length) await this.logModel.insertMany(logs);
    }

    return { broadcast, client: account, contacts, category, price, tenantId };
  }

  /**
   * Background half of sending: the actual batch-send loop plus refund
   * reconciliation for anything that didn't go out. Safe to run
   * fire-and-forget since prepareSend() already validated and reserved
   * funds synchronously.
   */
  async runSendLoop(prepared: {
    broadcast: BroadcastDocument;
    client: any;
    contacts: any[];
    category: MessageCategory;
    price: { sellingPrice: number; taxPercent: number };
    tenantId: Types.ObjectId;
  }) {
    const { broadcast, client, contacts, category, price, tenantId } = prepared;
    const contactByPhone = new Map(contacts.map((contact) => [String(contact.phone), contact]));

    // Process in batches of 10 with 1s delay (Meta rate limit safe)
    const BATCH = 10;
    let sent = 0, failed = 0;

    while (true) {
      const current = await this.broadcastModel.findById(broadcast._id);
      if (!current) return { sent: 0, failed: 0, total: contacts.length };
      if (current.status === 'paused' || current.status === 'canceled') {
        return this.currentRunSummary(broadcast._id);
      }

      const batch = await this.logModel
        .find({ broadcastId: broadcast._id, status: 'queued' })
        .sort({ createdAt: 1 })
        .limit(BATCH);
      if (!batch.length) break;
      await Promise.all(
        batch.map(async (log) => {
          const contact = contactByPhone.get(String(log.phone)) || { phone: log.phone, variables: {}, name: log.contactName };
          try {
            const res = await this.meta.sendTemplate(
              client.phoneNumberId,
              client.accessToken,
              contact.phone,
              broadcast.templateName,
              broadcast.languageCode,
              this.resolveComponents(broadcast.components, contact.variables || {}),
            );
            await this.logModel.findOneAndUpdate(
              { _id: log._id, status: 'queued' },
              { status: 'sent', waMessageId: res?.messages?.[0]?.id, sentAt: new Date() },
            );
            sent++;
            await this.broadcastModel.findByIdAndUpdate(broadcast._id, { $inc: { sentCount: 1 } });
          } catch (err) {
            const e = this.extractMetaError(err);
            await this.logModel.findOneAndUpdate(
              { _id: log._id, status: 'queued' },
              {
                status: 'failed',
                errorCode: e.code,
                errorSubcode: e.subcode,
                errorType: e.type,
                errorMessage: e.message,
                errorDetails: e.details,
              },
            );
            failed++;
            await this.broadcastModel.findByIdAndUpdate(broadcast._id, { $inc: { failedCount: 1 } });
          }
        }),
      );
      await sleep(1000); // 10 msg/s
    }

    const [sentLogs, failedLogs] = await Promise.all([
      this.logModel.countDocuments({ broadcastId: broadcast._id, status: { $in: ['sent', 'delivered', 'read'] } }),
      this.logModel.countDocuments({ broadcastId: broadcast._id, status: 'failed' }),
    ]);
    sent = sentLogs;
    failed = failedLogs;

    await this.broadcastModel.findByIdAndUpdate(broadcast._id, {
      status: 'done',
      sentCount: sent,
      failedCount: failed,
      completedAt: new Date(),
    });

    // Reconcile: refund the reserved amount for whatever never actually
    // went out — failed sends are never charged.
    const unsent = contacts.length - sent;
    if (unsent > 0 && price.sellingPrice > 0) {
      const refundAmount = Number(
        (price.sellingPrice * unsent * (1 + price.taxPercent / 100)).toFixed(4),
      );
      if (refundAmount > 0) {
        await this.wallet.refund(tenantId, refundAmount, {
          description: `Refund for ${unsent} unsent/failed message(s) in campaign "${broadcast.name}"`,
          referenceId: String(broadcast._id),
          campaignId: String(broadcast._id),
          messageCategory: category,
        });
      }
    }

    return { sent, failed, total: contacts.length };
  }

  // Convenience wrapper for callers (tests, scripts) that want prepare+run
  // as a single awaited call rather than the controller's fire-and-forget split.
  async send(broadcastId: string) {
    const prepared = await this.prepareSend(broadcastId);
    return this.runSendLoop(prepared);
  }

  async schedule(id: string, scheduledAt: string | Date) {
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Choose a valid schedule date.');
    if (date <= new Date()) throw new BadRequestException('Schedule date must be in the future.');
    const broadcast = await this.broadcastModel.findById(id);
    if (!broadcast) throw new NotFoundException();
    if (!['draft', 'scheduled', 'paused'].includes(broadcast.status)) {
      throw new BadRequestException('Only draft, paused, or already scheduled campaigns can be scheduled.');
    }
    return this.broadcastModel.findByIdAndUpdate(id, { status: 'scheduled', scheduledAt: date }, { new: true });
  }

  async pause(id: string) {
    const broadcast = await this.broadcastModel.findById(id);
    if (!broadcast) throw new NotFoundException();
    if (broadcast.status !== 'running') throw new BadRequestException('Only running campaigns can be paused.');
    return this.broadcastModel.findByIdAndUpdate(id, { status: 'paused' }, { new: true });
  }

  async cancel(id: string) {
    const broadcast = await this.broadcastModel.findById(id);
    if (!broadcast) throw new NotFoundException();
    if (TERMINAL_BROADCAST_STATUSES.has(broadcast.status)) return broadcast;
    await this.broadcastModel.findByIdAndUpdate(id, { status: 'canceled', canceledAt: new Date(), scheduledAt: null });
    const [canceledCount, failedCount] = await Promise.all([
      this.logModel.countDocuments({ broadcastId: broadcast._id, status: 'queued' }),
      this.logModel.countDocuments({ broadcastId: broadcast._id, status: 'failed' }),
    ]);
    if (canceledCount > 0) {
      await this.logModel.updateMany(
        { broadcastId: broadcast._id, status: 'queued' },
        { status: 'canceled', errorMessage: 'Campaign canceled before sending.' },
      );
    }
    await this.refundUnsent(broadcast, canceledCount + failedCount, 'canceled');
    return this.recountAndUpdate(broadcast._id, { status: 'canceled', canceledAt: new Date(), scheduledAt: null });
  }

  async duplicate(id: string) {
    const broadcast = await this.broadcastModel.findById(id).lean();
    if (!broadcast) throw new NotFoundException();
    const {
      _id, createdAt, updatedAt, sentCount, deliveredCount, readCount, failedCount, canceledCount, totalCount,
      reservedAmount, reservationTxnId, startedAt, completedAt, canceledAt, ...copy
    } = broadcast as any;
    return this.broadcastModel.create({
      ...copy,
      name: `${broadcast.name} Copy`,
      status: 'draft',
      scheduledAt: undefined,
      startedAt: undefined,
      completedAt: undefined,
      canceledAt: undefined,
      totalCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      canceledCount: 0,
      reservedAmount: 0,
      reservationTxnId: undefined,
    });
  }

  async sendTest(id: string, phone: string) {
    const broadcast = await this.broadcastModel.findById(id);
    if (!broadcast) throw new NotFoundException();
    const cleanPhone = String(phone || '').replace(/[^\d+]/g, '');
    if (cleanPhone.length < 5) throw new BadRequestException('Enter a valid test phone number.');
    const account = await this.clients.findOne(this.accountIdOf(broadcast));
    const result = await this.meta.sendTemplate(
      account.phoneNumberId,
      account.accessToken,
      cleanPhone,
      broadcast.templateName,
      broadcast.languageCode,
      this.resolveComponents(broadcast.components, {}),
    );
    return { message: 'Test message sent', waMessageId: result?.messages?.[0]?.id };
  }

  async exportLogsCsv(id: string) {
    const broadcast = await this.broadcastModel.findById(id);
    if (!broadcast) throw new NotFoundException();
    const logs = await this.logModel.find({ broadcastId: toObjectId(id, 'broadcastId') }).sort({ createdAt: 1 });
    const headers = ['contactName', 'phone', 'status', 'waMessageId', 'errorCode', 'errorSubcode', 'errorType', 'errorMessage', 'sentAt', 'createdAt'];
    const rows = logs.map((log: any) => headers.map((field) => this.csvCell(log[field])).join(','));
    return {
      filename: `${String(broadcast.name || 'broadcast').replace(/[^a-z0-9_-]+/gi, '_')}_logs.csv`,
      csv: [headers.join(','), ...rows].join('\n'),
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueScheduledBroadcasts() {
    const due = await this.broadcastModel
      .find({ status: 'scheduled', scheduledAt: { $lte: new Date() } })
      .sort({ scheduledAt: 1 })
      .limit(5);

    for (const broadcast of due) {
      try {
        const prepared = await this.prepareSend(String(broadcast._id));
        this.runSendLoop(prepared).catch((err) => this.logger.error(`Scheduled broadcast ${broadcast._id} failed`, err));
      } catch (err) {
        this.logger.error(`Could not start scheduled broadcast ${broadcast._id}`, err);
        await this.broadcastModel.findByIdAndUpdate(broadcast._id, {
          status: 'failed',
          completedAt: new Date(),
        });
      }
    }
  }

  private async resolveCategory(broadcast: BroadcastDocument): Promise<MessageCategory> {
    const template = await this.templates.findByName(this.accountIdOf(broadcast), broadcast.templateName);
    const raw = (template?.category || 'utility').toLowerCase();
    if (raw === 'marketing') return MessageCategory.MARKETING;
    if (raw === 'authentication') return MessageCategory.AUTHENTICATION;
    if (raw === 'service') return MessageCategory.SERVICE;
    return MessageCategory.UTILITY;
  }

  private async resolvePlanPrice(tenantId: string, category: MessageCategory) {
    const tenant = await this.tenantModel.findById(toObjectId(tenantId, 'tenantId'));
    if (!tenant?.planId) {
      throw new NotFoundException('No active plan is assigned to this client.');
    }

    const plan = await this.planModel.findById(tenant.planId);
    if (!plan) throw new NotFoundException('Client plan not found.');

    const rawRate = plan.messageRates?.[category] ?? 0;
    const sellingPrice = Number(rawRate);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      throw new NotFoundException(`No valid ${category} message rate is configured for plan "${plan.name}".`);
    }

    return {
      sellingPrice,
      currency: plan.currency || 'INR',
      taxPercent: plan.taxPercent || 0,
      planId: String(plan._id),
    };
  }

  /** Replace {{variable}} tokens in component params */
  private resolveComponents(components: any[] | undefined, vars: Record<string, string>) {
    if (!components || components.length === 0) return [];
    return components.map(comp => ({
      ...comp,
      parameters: comp.parameters?.map((p: any) => {
        if (p.type === 'text') return { ...p, text: p.text.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] || '') };
        return p;
      }),
    }));
  }

  private whatsappAccountIdQuery(id: string) {
    return whatsappAccountIdFilter(id);
  }

  private accountIdOf(broadcast: any) {
    return String(broadcast.whatsappAccountId || broadcast.clientId);
  }

  private normalizeBroadcastStatus(status: string) {
    const normalized = String(status || '').trim().toLowerCase();
    if (!['draft', 'scheduled', 'running', 'paused', 'canceled', 'done', 'failed'].includes(normalized)) {
      throw new BadRequestException('Choose a valid campaign status.');
    }
    return normalized;
  }

  private extractMetaError(err: any) {
    const metaError = err?.response?.data?.error || {};
    const details = metaError?.error_data?.details || metaError?.details;
    return {
      code: metaError?.code ? String(metaError.code) : undefined,
      subcode: metaError?.error_subcode ? String(metaError.error_subcode) : undefined,
      type: metaError?.type,
      message: details || metaError?.message || err?.message || 'Unknown send failure',
      details: err?.response?.data || undefined,
    };
  }

  private async currentRunSummary(broadcastId: any) {
    const [sent, failed, canceled, total] = await Promise.all([
      this.logModel.countDocuments({ broadcastId, status: { $in: ['sent', 'delivered', 'read'] } }),
      this.logModel.countDocuments({ broadcastId, status: 'failed' }),
      this.logModel.countDocuments({ broadcastId, status: 'canceled' }),
      this.logModel.countDocuments({ broadcastId }),
    ]);
    return { sent, failed, canceled, total };
  }

  private async recountAndUpdate(broadcastId: any, extra: Record<string, any> = {}) {
    const [sentCount, deliveredCount, readCount, failedCount, canceledCount, totalCount] = await Promise.all([
      this.logModel.countDocuments({ broadcastId, status: { $in: ['sent', 'delivered', 'read'] } }),
      this.logModel.countDocuments({ broadcastId, status: { $in: ['delivered', 'read'] } }),
      this.logModel.countDocuments({ broadcastId, status: 'read' }),
      this.logModel.countDocuments({ broadcastId, status: 'failed' }),
      this.logModel.countDocuments({ broadcastId, status: 'canceled' }),
      this.logModel.countDocuments({ broadcastId }),
    ]);
    return this.broadcastModel.findByIdAndUpdate(
      broadcastId,
      { sentCount, deliveredCount, readCount, failedCount, canceledCount, totalCount, ...extra },
      { new: true },
    );
  }

  private async refundUnsent(broadcast: any, count: number, reason: 'failed' | 'canceled') {
    if (!count || count <= 0) return;
    const unitPrice = Number(broadcast.appliedUnitPrice || 0);
    const taxPercent = Number(broadcast.appliedTaxPercent || 0);
    if (unitPrice <= 0) return;
    const tenantId = toObjectId(broadcast.tenantId, 'tenantId');
    const amount = Number((unitPrice * count * (1 + taxPercent / 100)).toFixed(4));
    if (amount <= 0) return;
    await this.wallet.refund(tenantId, amount, {
      description: `Refund for ${count} ${reason} message(s) in campaign "${broadcast.name}"`,
      referenceId: String(broadcast._id),
      campaignId: String(broadcast._id),
      messageCategory: broadcast.messageCategory,
    });
  }

  private csvCell(value: any) {
    if (value === undefined || value === null) return '';
    const raw = value instanceof Date ? value.toISOString() : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
  }

  /** Called by webhook when Meta sends status update. */
  async handleStatusUpdate(waMessageId: string, status: string) {
    const log = await this.logModel.findOne({ waMessageId });
    if (!log) return;
    if (log.status === status) return; // duplicate webhook delivery — already processed

    // Status order: sent < delivered < read. Ignore out-of-order/duplicate retries.
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 1 };
    if ((rank[status] ?? 0) <= (rank[log.status] ?? 0) && status !== 'failed') return;

    await this.logModel.findByIdAndUpdate(log._id, { status });

    const field = status === 'delivered' ? 'deliveredCount' : status === 'read' ? 'readCount' : null;
    if (field) {
      await this.broadcastModel.findByIdAndUpdate(log.broadcastId, { $inc: { [field]: 1 } });
    }
  }
}
