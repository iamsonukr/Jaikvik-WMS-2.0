import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Broadcast, BroadcastDocument, BroadcastLog, BroadcastLogDocument } from './broadcast.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { ContactsService } from '../contacts/contacts.service';
import { TemplatesService } from '../templates/templates.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletService } from '../wallet/wallet.service';
import { MessageCategory } from '../pricing/message-pricing.schema';
import { legacyObjectIdFilter, toObjectId } from '../common/mongo-id';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
    private pricing: PricingService,
    private wallet: WalletService,
  ) {}

  findAll(clientId: string) {
    return this.broadcastModel.aggregate([
      { $match: this.clientIdQuery(clientId) },
      { $sort: { createdAt: -1 } },
    ]);
  }

  findOne(id: string) { return this.broadcastModel.findById(id); }

  async create(dto: Omit<Partial<Broadcast>, 'clientId'> & { clientId: string }) {
    // Stamp tenantId at creation time (not just at send time) so the field
    // is always populated for reporting/filtering, matching every other
    // tenant-scoped collection in the schema.
    const client = await this.clients.findOne(dto.clientId);
    return this.broadcastModel.create({
      ...dto,
      clientId: toObjectId(dto.clientId, 'clientId'),
      tenantId: client?.tenantId,
    });
  }

  async update(id: string, dto: Partial<Broadcast>) {
    const doc = await this.broadcastModel.findByIdAndUpdate(id, dto, { new: true });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  logs(broadcastId: string) {
    return this.logModel.find({ broadcastId: toObjectId(broadcastId, 'broadcastId') }).limit(500);
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

    const client = await this.clients.findOne(String(broadcast.clientId));
    const tenantId = toObjectId(broadcast.tenantId || client.tenantId, 'tenantId');
    const contacts = await this.contacts.findBySegment(String(broadcast.clientId), broadcast.targetTags);
    const category = await this.resolveCategory(broadcast);
    const price = await this.pricing.resolvePrice(String(tenantId), category, 'default');
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
    if (['running', 'done'].includes(broadcast.status)) {
      throw new Error(`Broadcast is already ${broadcast.status}`);
    }

    const client = await this.clients.findOne(String(broadcast.clientId));
    const tenantId = toObjectId(broadcast.tenantId || client.tenantId, 'tenantId');
    const contacts = await this.contacts.findBySegment(String(broadcast.clientId), broadcast.targetTags);
    const category = await this.resolveCategory(broadcast);
    const price = await this.pricing.resolvePrice(String(tenantId), category, 'default');

    const totalCost = Number(
      (price.sellingPrice * contacts.length * (1 + price.taxPercent / 100)).toFixed(4),
    );

    // Reserve the full estimated cost before a single message goes out.
    // Throws (blocking the send) if the wallet balance is insufficient.
    const reservation =
      totalCost > 0
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
      reservedAmount: totalCost,
      reservationTxnId: reservation?._id,
    });

    // Create log entries — each stamped with the price applied to it, so
    // historical reports stay correct even after pricing changes later.
    const logs = contacts.map(c => ({
      broadcastId: broadcast._id,
      clientId: toObjectId(broadcast.clientId, 'clientId'),
      tenantId,
      phone: c.phone,
      contactName: c.name,
      status: 'queued',
      messageCategory: category,
      appliedUnitPrice: price.sellingPrice,
      appliedTaxPercent: price.taxPercent,
    }));
    await this.logModel.insertMany(logs);

    return { broadcast, client, contacts, category, price, tenantId };
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

    // Process in batches of 10 with 1s delay (Meta rate limit safe)
    const BATCH = 10;
    let sent = 0, failed = 0;

    for (let i = 0; i < contacts.length; i += BATCH) {
      const batch = contacts.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (contact) => {
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
              { broadcastId: broadcast._id, phone: contact.phone },
              { status: 'sent', waMessageId: res?.messages?.[0]?.id },
            );
            sent++;
          } catch (err) {
            const e = err?.response?.data?.error;
            await this.logModel.findOneAndUpdate(
              { broadcastId: broadcast._id, phone: contact.phone },
              { status: 'failed', errorCode: e?.code, errorMessage: e?.message },
            );
            failed++;
          }
        }),
      );
      await sleep(1000); // 10 msg/s
    }

    await this.broadcastModel.findByIdAndUpdate(broadcast._id, {
      status: 'done',
      sentCount: sent,
      failedCount: failed,
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

  private async resolveCategory(broadcast: BroadcastDocument): Promise<MessageCategory> {
    const template = await this.templates.findByName(String(broadcast.clientId), broadcast.templateName);
    const raw = (template?.category || 'utility').toLowerCase();
    if (raw === 'marketing') return MessageCategory.MARKETING;
    if (raw === 'authentication') return MessageCategory.AUTHENTICATION;
    if (raw === 'service') return MessageCategory.SERVICE;
    return MessageCategory.UTILITY;
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

  private clientIdQuery(id: string) {
    return legacyObjectIdFilter('clientId', id);
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
