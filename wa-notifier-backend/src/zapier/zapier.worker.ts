import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { ZapierConnection, ZapierDelivery, ZapierHook } from './zapier.schema';
import { Contact } from '../contacts/contact.schema';
import { Message } from '../inbox/message.schema';
import { BroadcastLog } from '../broadcasts/broadcast.schema';
import { ZapierService } from './zapier.service';
import { normalizeHookUrl, secretHash } from './zapier.utils';
import { whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class ZapierWorker {
  private collecting = false;
  private delivering = false;
  private readonly logger = new Logger(ZapierWorker.name);
  constructor(
    @InjectModel(ZapierConnection.name) private connections: Model<ZapierConnection>,
    @InjectModel(ZapierHook.name) private hooks: Model<ZapierHook>,
    @InjectModel(ZapierDelivery.name) private deliveries: Model<ZapierDelivery>,
    @InjectModel(Contact.name) private contacts: Model<Contact>,
    @InjectModel(Message.name) private messages: Model<Message>,
    @InjectModel(BroadcastLog.name) private logs: Model<BroadcastLog>,
    private integration: ZapierService,
  ) {}

  @Cron('0 * * * * *')
  async collect() {
    if (this.collecting) return;
    this.collecting = true;
    try {
      const active = await this.connections.find({ enabled: true }).select('whatsappAccountId').lean();
      for (const connection of active) {
        const accountId = String(connection.whatsappAccountId);
        try { await this.integration.activeAccount(accountId); } catch { continue; }
        const hooks = await this.hooks.find({ whatsappAccountId: accountId, enabled: true }).select('_id').lean();
        for (const item of hooks) {
          const owner = randomBytes(16).toString('hex');
          const hook = await this.hooks.findOneAndUpdate({ _id: item._id, enabled: true,
            $or: [{ scanLockedUntil: null }, { scanLockedUntil: { $lte: new Date() } }] },
            { scanLockOwner: owner, scanLockedUntil: new Date(Date.now() + 120000) }, { new: true });
          if (!hook) continue;
          try {
            if (hook.event === 'contact.created') await this.scan(hook, 'contact', this.contacts, 'createdAt', {});
            if (hook.event === 'message.received') await this.scan(hook, 'inbox', this.messages, 'createdAt', { direction: 'inbound' });
            if (hook.event === 'message.status_updated') {
              await this.scan(hook, 'inbox', this.messages, 'updatedAt', { direction: 'outbound' });
              await this.scan(hook, 'campaign', this.logs, 'updatedAt', {});
            }
            await this.hooks.updateOne({ _id: hook._id, revision: hook.revision, scanLockOwner: owner }, { lastScannedAt: new Date(), lastError: '' });
          } catch {
            await this.hooks.updateOne({ _id: hook._id, revision: hook.revision, scanLockOwner: owner }, { lastError: 'Event collection failed. WMS will retry automatically.' });
          } finally {
            await this.hooks.updateOne({ _id: hook._id, scanLockOwner: owner }, { $unset: { scanLockOwner: 1, scanLockedUntil: 1 } });
          }
        }
      }
    } catch { this.logger.warn('Zapier event collection failed; retrying on the next scheduled run.'); }
    finally { this.collecting = false; }
  }
  private async scan(hook: any, source: string, model: Model<any>, field: string, extra: any) {
    const accountId = String(hook.whatsappAccountId);
    const saved = hook.cursors?.[source];
    const from = new Date(saved?.time || hook.startsAt);
    const horizon = new Date(Date.now() - 5000);
    const after = saved?.id ? { $or: [{ [field]: { $gt: from } }, { [field]: from, _id: { $gt: new Types.ObjectId(saved.id) } }] } : { [field]: { $gte: from } };
    const records = await model.find({ $and: [whatsappAccountIdFilter(accountId), extra, after,
      { [field]: { $gte: hook.startsAt, $lte: horizon } }] }).sort({ [field]: 1, _id: 1 }).limit(200).lean();
    const jobs = records.flatMap((record: any) => {
      const status = source === 'campaign' ? record.status : record.deliveryStatus;
      if (hook.event === 'message.status_updated' && !['sent', 'delivered', 'read', 'failed', 'canceled'].includes(status)) return [];
      const eventId = secretHash([accountId, hook.event, source, String(record._id), hook.event === 'message.status_updated' ? status : 'created'].join('|'));
      // Only public integration fields; never export wallet data, tokens,
      // internal notes, media credentials, or the full Mongo document.
      const data: any = { id: String(record._id), phone: record.phone, name: record.name || record.contactName || '' };
      if (hook.event === 'contact.created') Object.assign(data, { tags: record.tags || [], customFields: record.customFields || {} });
      else if (hook.event === 'message.received') Object.assign(data, { type: record.type, text: record.text || '', waMessageId: record.waMessageId || '' });
      else Object.assign(data, { source, status, waMessageId: record.waMessageId || '', campaignId: String(record.broadcastId || ''), errorCode: record.errorCode || '' });
      const payload = { id: eventId, event: hook.event, test: false, whatsappAccountId: accountId, occurredAt: new Date(record[field]).toISOString(), data };
      return [{ updateOne: { filter: { hookId: hook._id, eventId }, update: { $setOnInsert: {
        whatsappAccountId: hook.whatsappAccountId, hookId: hook._id, hookRevision: hook.revision, eventId, payload,
        status: 'pending', attempts: 0, nextAttemptAt: new Date(),
      } }, upsert: true } }];
    });
    // Queue before advancing the cursor. A restart can repeat the scan safely
    // because each hook/event pair has a unique index.
    if (jobs.length) await this.deliveries.bulkWrite(jobs, { ordered: false });
    const last: any = records[records.length - 1];
    const cursor = records.length === 200 ? { time: last[field], id: String(last._id) }
      : { time: new Date(Math.max(new Date(hook.startsAt).getTime(), horizon.getTime() - 120000)), id: null };
    await this.hooks.updateOne({ _id: hook._id, enabled: true, revision: hook.revision, scanLockOwner: hook.scanLockOwner },
      { $set: { [`cursors.${source}`]: cursor } });
  }

  @Cron('*/15 * * * * *')
  async deliver() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      for (let i = 0; i < 50; i++) {
        const owner = randomBytes(16).toString('hex');
        const now = new Date();
        const job = await this.deliveries.findOneAndUpdate({ nextAttemptAt: { $lte: now }, $or: [
          { status: 'pending' }, { status: 'processing', lockedUntil: { $lte: now } },
        ] }, { $set: { status: 'processing', lockOwner: owner, lockedUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } },
        { new: true, sort: { nextAttemptAt: 1, _id: 1 } });
        if (!job) break;
        const filter = { _id: job._id, status: 'processing', lockOwner: owner };
        try {
          if (job.attempts > 6) {
            await this.deliveries.updateOne(filter, { status: 'failed', lastError: 'Retry limit reached after interrupted deliveries. Review the Zap before retrying.' });
            continue;
          }
          const hook = await this.hooks.findOne({ _id: job.hookId, whatsappAccountId: job.whatsappAccountId, enabled: true, revision: job.hookRevision }).select('+url');
          const connection = await this.connections.exists({ whatsappAccountId: job.whatsappAccountId, enabled: true });
          if (!hook || !connection) {
            await this.deliveries.updateOne(filter, { status: 'canceled', lastError: 'Connection or hook was disabled or changed.' });
            continue;
          }
          try { await this.integration.activeAccount(String(job.whatsappAccountId)); }
          catch (error) {
            if (!(error instanceof ForbiddenException)) throw error;
            await this.deliveries.updateOne(filter, { status: 'canceled', lastError: 'WhatsApp account or client is inactive.' });
            continue;
          }
          const url = normalizeHookUrl(hook.url);
          const response = await axios.post(url, job.payload, { timeout: 10000, maxRedirects: 0, maxContentLength: 65536,
            headers: { 'Content-Type': 'application/json', 'X-WMS-Event-ID': job.eventId }, validateStatus: status => status >= 200 && status < 300 });
          await this.deliveries.updateOne(filter, { status: 'delivered', deliveredAt: new Date(), responseStatus: response.status, lastError: '' });
        } catch (error) {
          const status = Number(error?.response?.status) || undefined;
          // Redact catch URLs and all upstream bodies from logs and responses.
          const terminal = job.attempts >= 6 || (status >= 400 && status < 500 && ![408, 429].includes(status));
          await this.deliveries.updateOne(filter, { status: terminal ? 'failed' : 'pending', responseStatus: status,
            lastError: status ? `Zapier returned HTTP ${status}. Check the Zap and its Catch Hook URL.` : 'Webhook request failed or timed out.',
            nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts - 1, 7))),
            $unset: { lockOwner: 1, lockedUntil: 1 },
          });
        }
      }
    } catch { this.logger.warn('Zapier delivery worker failed; pending deliveries will be retried.'); }
    finally { this.delivering = false; }
  }
}
