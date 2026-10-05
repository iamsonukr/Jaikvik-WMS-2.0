import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { CalendlyBooking, CalendlyConnection, CalendlyJob } from './calendly.schema';
import { CalendlySettingsDto } from './calendly.dto';
import { bookingFields, calendlyUri, verifySignature } from './calendly.utils';
import { decryptToken, encryptToken, hash, phoneNumber } from '../google-sheets/sheets.utils';
import { templateParameterCount } from '../zapier/zapier.utils';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { TemplatesService } from '../templates/templates.service';
import { InboxService } from '../inbox/inbox.service';
import { Contact } from '../contacts/contact.schema';
import { Tenant } from '../tenants/tenant.schema';
import { toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';

const disabledRule = () => ({ enabled: false, templateName: '', parameters: [] });
export const defaultCalendlySettings = () => ({ phoneQuestion: 'WhatsApp number', consentQuestion: 'May we send you WhatsApp appointment updates?',
  consentAnswer: 'Yes', reminderMinutes: 60, confirmation: disabledRule(), cancellation: disabledRule(), reminder: disabledRule() });

@Injectable()
export class CalendlyService implements OnModuleInit {
  private working = false;
  private readonly logger = new Logger(CalendlyService.name);
  constructor(
    @InjectModel(CalendlyConnection.name) private connections: Model<CalendlyConnection>,
    @InjectModel(CalendlyBooking.name) private bookings: Model<CalendlyBooking>,
    @InjectModel(CalendlyJob.name) private jobs: Model<CalendlyJob>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(Contact.name) private contacts: Model<Contact>,
    private accounts: WhatsAppAccountsService, private templates: TemplatesService,
    private inbox: InboxService, private config: ConfigService,
  ) {}
  async onModuleInit() { await Promise.all([this.connections.init(), this.bookings.init(), this.jobs.init()]); }
  private encryptionKey() {
    const key = this.config.get<string>('CALENDLY_ENCRYPTION_KEY') || '';
    if (!/^[a-f0-9]{64}$/i.test(key)) throw new BadRequestException('Configure CALENDLY_ENCRYPTION_KEY with 64 hexadecimal characters.');
    return Buffer.from(key, 'hex');
  }
  private publicBase() {
    let url: URL;
    try { url = new URL(this.config.get<string>('CALENDLY_PUBLIC_API_URL')); } catch { throw new BadRequestException('Configure CALENDLY_PUBLIC_API_URL with the public HTTPS API base.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new BadRequestException('Calendly requires a public HTTPS API base.');
    }
    return url.href.replace(/\/+$/, '');
  }
  async activeAccount(id: string) {
    const account = await this.accounts.findOne(id);
    if (!account?.isActive || account.isRemoved || !account.tenantId) throw new ForbiddenException('WhatsApp account is inactive.');
    const tenant = await this.tenants.findById(account.tenantId);
    if (!tenant || tenant.status !== 'active') throw new ForbiddenException('Client is inactive.');
    return account;
  }
  private async api(method: 'GET' | 'POST' | 'DELETE', path: string, token: string, data?: any) {
    return (await axios.request({ method, url: `https://api.calendly.com${path}`, data,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 10000, maxRedirects: 0, maxContentLength: 1024 * 1024 })).data;
  }
  private async resource(uri: string, type: string, token: string) {
    calendlyUri(uri, type);
    return (await this.api('GET', new URL(uri).pathname, token)).resource;
  }
  async status(id: string) {
    let configured = true;
    try { this.encryptionKey(); this.publicBase(); } catch { configured = false; }
    const [connection, bookings, jobs, templates] = await Promise.all([
      this.connections.findOne({ whatsappAccountId: id }).select('connected name settings subscription').lean(),
      this.bookings.find({ whatsappAccountId: id }).sort({ createdAt: -1 }).limit(30).lean(),
      this.jobs.find({ whatsappAccountId: id }).select('-lockOwner -rule').sort({ createdAt: -1 }).limit(30).lean(),
      this.templates.findAll(id),
    ]);
    const supported = templates.flatMap(template => {
      try { return [{ name: template.name, language: template.language, count: templateParameterCount(template) }]; } catch { return []; }
    });
    return { configured, connected: connection?.connected || false, cleanupPending: !!connection?.subscription && !connection.connected,
      name: connection?.name, settings: { ...defaultCalendlySettings(), ...connection?.settings }, bookings, jobs, templates: supported };
  }
  private async management(id: string, operation: () => Promise<any>) {
    await this.connections.updateOne({ whatsappAccountId: id }, { $setOnInsert: { whatsappAccountId: toObjectId(id) } }, { upsert: true });
    const owner = randomBytes(16).toString('hex');
    const locked = await this.connections.findOneAndUpdate({ whatsappAccountId: id,
      $or: [{ managementUntil: null }, { managementUntil: { $lte: new Date() } }] },
      { managementOwner: owner, managementUntil: new Date(Date.now() + 120000) });
    if (!locked) throw new ConflictException('Another Calendly setup operation is running.');
    try { return await operation(); }
    finally { await this.connections.updateOne({ whatsappAccountId: id, managementOwner: owner }, { $unset: { managementOwner: 1, managementUntil: 1 } }); }
  }
  async connect(id: string, token: string) {
    const key = this.encryptionKey(); const base = this.publicBase();
    await this.activeAccount(id);
    return this.management(id, async () => {
      const existing = await this.connections.findOne({ whatsappAccountId: id });
      if (existing?.subscription) throw new BadRequestException('Disconnect the existing Calendly subscription before connecting again.');
      let subscription: string;
      const signingKey = randomBytes(32).toString('hex');
      const revision = (existing?.revision || 0) + 1;
      // Persist cleanup credentials before the external subscription is created.
      await this.connections.updateOne({ whatsappAccountId: id }, { token: encryptToken(token.trim(), key), signingKey: encryptToken(signingKey, key), revision });
      try {
        const user = (await this.api('GET', '/users/me', token.trim())).resource;
        calendlyUri(user.uri, 'users'); calendlyUri(user.current_organization, 'organizations');
        const result = await this.api('POST', '/webhook_subscriptions', token.trim(), {
          url: `${base}/webhooks/calendly/${id}/${revision}`, events: ['invitee.created', 'invitee.canceled'],
          organization: user.current_organization, user: user.uri, scope: 'user', signing_key: signingKey,
        });
        subscription = calendlyUri(result.resource.uri, 'webhook_subscriptions');
        await this.connections.updateOne({ whatsappAccountId: id }, { subscription, user: user.uri, name: user.name, connected: true });
        return { connected: true };
      } catch {
        if (subscription) {
          try { await this.api('DELETE', new URL(subscription).pathname, token.trim()); }
          catch { await this.connections.updateOne({ whatsappAccountId: id }, { subscription, connected: false }); }
        }
        throw new BadRequestException('Calendly connection failed. Check the token permissions, webhook availability and public API URL.');
      }
    });
  }
  async disconnect(id: string) {
    return this.management(id, async () => {
      const connection = await this.connections.findOne({ whatsappAccountId: id }).select('+token');
      // Stop local automation even when Calendly is temporarily unavailable.
      await this.connections.updateOne({ whatsappAccountId: id }, { connected: false });
      await this.jobs.updateMany({ whatsappAccountId: id, status: { $in: ['pending', 'processing'] } }, { status: 'canceled', error: 'Calendly disconnected.' });
      if (connection?.subscription) {
        try { await this.api('DELETE', new URL(calendlyUri(connection.subscription, 'webhook_subscriptions')).pathname, decryptToken(connection.token, this.encryptionKey())); }
        catch (error) { if (error?.response?.status !== 404) throw new BadRequestException('Local automation stopped. Calendly subscription cleanup failed; click Disconnect again to retry.'); }
      }
      await this.connections.updateOne({ whatsappAccountId: id }, { $unset: { token: 1, signingKey: 1, subscription: 1, user: 1 } });
      return { disconnected: true };
    });
  }
  async save(id: string, settings: CalendlySettingsDto) {
    if (!await this.connections.exists({ whatsappAccountId: id, connected: true })) throw new BadRequestException('Connect Calendly first.');
    if (!settings.confirmation || !settings.cancellation || !settings.reminder) throw new BadRequestException('All notification rules are required.');
    for (const rule of [settings.confirmation, settings.cancellation, settings.reminder]) {
      if (!rule.enabled) continue;
      const template = await this.templates.findByName(id, rule.templateName);
      if (rule.parameters.length !== templateParameterCount(template)) throw new BadRequestException('Map every template body parameter.');
    }
    await this.connections.updateOne({ whatsappAccountId: id, connected: true }, { settings });
    return { saved: true };
  }
  async receive(id: string, revision: string, raw: Buffer, signature: unknown, body: any) {
    if (!Types.ObjectId.isValid(id) || !/^\d+$/.test(revision)) throw new UnauthorizedException('Invalid Calendly webhook.');
    const connection = await this.connections.findOne({ whatsappAccountId: id, connected: true, revision: Number(revision) }).select('+signingKey');
    if (!connection) throw new UnauthorizedException('Calendly connection is unavailable.');
    verifySignature(raw, signature, decryptToken(connection.signingKey, this.encryptionKey()));
    if (!['invitee.created', 'invitee.canceled'].includes(body?.event)) return { ignored: true };
    const payload = body.payload;
    const eventUri = calendlyUri(payload?.event, 'scheduled_events');
    const inviteeUri = calendlyUri(payload?.uri, 'scheduled_events/[a-zA-Z0-9-]+/invitees');
    if (!inviteeUri.startsWith(`${eventUri}/invitees/`)) throw new BadRequestException('Invitee does not belong to the scheduled event.');
    if (body.event === 'invitee.canceled') {
      // A cancellation tombstone stops reminders even if creation arrives later.
      await this.bookings.updateOne({ whatsappAccountId: id, inviteeUri, revision: connection.revision },
        { $set: { status: 'canceled', eventUri }, $setOnInsert: { whatsappAccountId: toObjectId(id), inviteeUri, revision: connection.revision } }, { upsert: true });
      const booking = await this.bookings.findOne({ whatsappAccountId: id, inviteeUri, revision: connection.revision });
      await this.jobs.updateMany({ bookingId: booking._id, kind: { $in: ['confirmation', 'reminder'] }, status: 'pending' }, { status: 'canceled', error: 'Booking canceled.' });
    }
    // Store a bounded subset, never the complete invitee record or token.
    const questions = (Array.isArray(payload.questions_and_answers) ? payload.questions_and_answers : []).slice(0, 50)
      .map(q => ({ question: String(q.question || '').slice(0, 300), answer: String(q.answer || '').slice(0, 2000) }));
    const safePayload = { event: body.event, inviteeUri, eventUri, name: String(payload.name || '').slice(0, 200),
      phone: String(payload.text_reminder_number || '').slice(0, 100), timezone: String(payload.timezone || '').slice(0, 100),
      cancelUrl: String(payload.cancel_url || '').slice(0, 2000), rescheduleUrl: String(payload.reschedule_url || '').slice(0, 2000), questions };
    await this.jobs.updateOne({ whatsappAccountId: id, key: hash(`${body.event}|${inviteeUri}`), revision: connection.revision },
      { $setOnInsert: { whatsappAccountId: toObjectId(id), key: hash(`${body.event}|${inviteeUri}`), revision: connection.revision,
        kind: 'ingest', payload: safePayload, rule: { ...defaultCalendlySettings(), ...connection.settings }, dueAt: new Date() } }, { upsert: true });
    return { accepted: true };
  }
  private async queue(booking: any, kind: string, rule: any, dueAt: Date) {
    if (!rule?.enabled) return;
    const key = hash(`${booking.inviteeUri}|${kind}`);
    await this.jobs.updateOne({ whatsappAccountId: booking.whatsappAccountId, key, revision: booking.revision },
      { $setOnInsert: { whatsappAccountId: booking.whatsappAccountId, key, revision: booking.revision, bookingId: booking._id, kind, rule, dueAt } }, { upsert: true });
  }
  private async ingest(job: any, connection: any) {
    const data = job.payload; const settings = job.rule;
    const event = await this.resource(data.eventUri, 'scheduled_events', decryptToken(connection.token, this.encryptionKey()));
    if (!event || !Number.isFinite(new Date(event.start_time).getTime())) throw new BadRequestException('Invalid Calendly event time.');
    const answer = (question: string) => data.questions.find(q => q.question.trim().toLowerCase() === question.trim().toLowerCase())?.answer || '';
    const phone = phoneNumber(settings.phoneQuestion ? answer(settings.phoneQuestion) : data.phone);
    const consent = !!settings.consentQuestion && answer(settings.consentQuestion).trim().toLowerCase() === settings.consentAnswer.trim().toLowerCase();
    const canceled = data.event === 'invitee.canceled' || event.status === 'canceled';
    const fields = { eventUri: data.eventUri, name: data.name, phone, consent, eventName: event.name, startTime: new Date(event.start_time),
      timezone: data.timezone, cancelUrl: data.cancelUrl, rescheduleUrl: data.rescheduleUrl,
      location: String(event.location?.join_url || event.location?.location || '').slice(0, 2000) };
    const booking = await this.bookings.findOneAndUpdate({ whatsappAccountId: job.whatsappAccountId, inviteeUri: data.inviteeUri, revision: job.revision },
      { $set: { ...fields, ...(canceled ? { status: 'canceled' } : {}) },
        $setOnInsert: { whatsappAccountId: job.whatsappAccountId, inviteeUri: data.inviteeUri, revision: job.revision } }, { upsert: true, new: true });
    if (data.event === 'invitee.canceled') await this.queue(booking, 'cancellation', settings.cancellation, new Date());
    else if (booking.status !== 'canceled') {
      await this.queue(booking, 'confirmation', settings.confirmation, new Date());
      const due = new Date(booking.startTime.getTime() - settings.reminderMinutes * 60000);
      if (due > new Date()) await this.queue(booking, 'reminder', settings.reminder, due);
    }
  }
  private async send(job: any, connection: any) {
    const booking = await this.bookings.findById(job.bookingId);
    if (!booking || !booking.phone || !booking.consent) return 'Missing valid phone number or explicit WhatsApp consent.';
    if (job.kind !== 'cancellation' && (booking.status === 'canceled' || booking.startTime <= new Date())) return 'Booking canceled or already started.';
    const contact = await this.contacts.findOne({ ...whatsappAccountIdFilter(String(job.whatsappAccountId)), phone: booking.phone });
    if (contact && (!contact.isActive || contact.isOptedOut)) return 'Contact is inactive or opted out.';
    // Recheck live status before confirmations/reminders to cover delayed cancellation webhooks.
    if (job.kind !== 'cancellation') {
      const invitee = await this.resource(booking.inviteeUri, 'scheduled_events/[a-zA-Z0-9-]+/invitees', decryptToken(connection.token, this.encryptionKey()));
      if (invitee?.status !== 'active') return 'Calendly booking is no longer active.';
    }
    const template = await this.templates.findByName(String(job.whatsappAccountId), job.rule.templateName);
    if (templateParameterCount(template) !== job.rule.parameters.length) throw new BadRequestException('Template parameter mapping changed.');
    const fields = bookingFields(booking);
    const parameters = job.rule.parameters.map(field => fields[field]);
    if (parameters.some(value => typeof value !== 'string' || !value.trim() || value.length > 2000)) return 'A mapped template field is empty or too long.';
    const current = await this.connections.exists({ whatsappAccountId: job.whatsappAccountId, connected: true, revision: job.revision });
    const latest = await this.bookings.findById(job.bookingId);
    if (!current || (job.kind !== 'cancellation' && latest?.status === 'canceled')) return 'Connection or booking canceled.';
    // The persistent sending marker is written before billing/Meta. A crash or
    // uncertain response must never automatically repeat a paid send.
    const claim = await this.jobs.updateOne({ _id: job._id, status: 'processing', lockOwner: job.lockOwner }, { status: 'sending', lockedUntil: new Date(Date.now() + 120000) });
    if (!claim.modifiedCount) return 'Job was canceled.';
    const message = await this.inbox.sendTemplate(String(job.whatsappAccountId), booking.phone, template.name, template.language, parameters);
    await this.jobs.updateOne({ _id: job._id, status: 'sending', lockOwner: job.lockOwner }, { status: 'sent', messageId: message._id, error: '' });
    return null;
  }
  @Cron('*/15 * * * * *')
  async work() {
    if (this.working) return;
    this.working = true;
    try {
      await this.jobs.updateMany({ status: 'sending', lockedUntil: { $lte: new Date() } }, { status: 'needs_review', error: 'Interrupted send. Check Inbox and wallet before sending manually.' });
      for (let n = 0; n < 30; n++) {
        const owner = randomBytes(16).toString('hex');
        const job = await this.jobs.findOneAndUpdate({ dueAt: { $lte: new Date() }, $or: [
          { status: 'pending' }, { status: 'processing', lockedUntil: { $lte: new Date() } },
        ] }, { $set: { status: 'processing', lockOwner: owner, lockedUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } },
        { new: true, sort: { dueAt: 1, _id: 1 } }).select('+payload');
        if (!job) break;
        const filter = { _id: job._id, lockOwner: owner, status: 'processing' };
        try {
          const connection = await this.connections.findOne({ whatsappAccountId: job.whatsappAccountId, connected: true, revision: job.revision }).select('+token');
          if (!connection) { await this.jobs.updateOne(filter, { status: 'canceled', error: 'Connection is disconnected or replaced.' }); continue; }
          await this.activeAccount(String(job.whatsappAccountId));
          if (job.kind === 'ingest') {
            await this.ingest(job, connection);
            await this.jobs.updateOne(filter, { status: 'completed', error: '', $unset: { payload: 1 } });
          } else {
            const skipped = await this.send(job, connection);
            if (skipped) await this.jobs.updateOne(filter, { status: 'skipped', error: skipped });
          }
        } catch (error) {
          const sending = await this.jobs.exists({ _id: job._id, lockOwner: owner, status: 'sending' });
          if (sending) await this.jobs.updateOne({ _id: job._id, lockOwner: owner, status: 'sending' }, { status: 'needs_review', error: 'Send did not complete reliably. Check Inbox and wallet; no automatic retry.' });
          else {
            const permanent = error instanceof BadRequestException || error instanceof ForbiddenException || job.attempts >= 6
              || (error?.response?.status >= 400 && error.response.status < 500 && ![408, 429].includes(error.response.status));
            await this.jobs.updateOne(filter, { status: permanent ? 'failed' : 'pending',
              error: 'Calendly processing failed. Check connection, booking and template settings.',
              dueAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7))) });
          }
        }
      }
    } catch { this.logger.warn('Calendly worker interrupted; pending jobs will resume.'); }
    finally { this.working = false; }
  }
}
