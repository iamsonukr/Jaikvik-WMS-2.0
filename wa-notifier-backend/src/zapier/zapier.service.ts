import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { ZapierAction, ZapierConnection, ZapierDelivery, ZapierHook } from './zapier.schema';
import { CreateZapierHookDto, ZapierContactDto, ZapierSendDto } from './zapier.dto';
import { canonicalJson, normalizeHookUrl, safeCustomFields, secretHash, templateParameterCount } from './zapier.utils';
import { Contact } from '../contacts/contact.schema';
import { Tenant } from '../tenants/tenant.schema';
import { ContactsService } from '../contacts/contacts.service';
import { InboxService } from '../inbox/inbox.service';
import { TemplatesService } from '../templates/templates.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class ZapierService implements OnModuleInit {
  constructor(
    @InjectModel(ZapierConnection.name) private connections: Model<ZapierConnection>,
    @InjectModel(ZapierHook.name) private hooks: Model<ZapierHook>,
    @InjectModel(ZapierDelivery.name) private deliveries: Model<ZapierDelivery>,
    @InjectModel(ZapierAction.name) private actions: Model<ZapierAction>,
    @InjectModel(Contact.name) private contactModel: Model<Contact>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    private accounts: WhatsAppAccountsService, private contacts: ContactsService,
    private inbox: InboxService, private templates: TemplatesService,
  ) {}

  async onModuleInit() {
    await Promise.all([this.connections.init(), this.hooks.init(), this.deliveries.init(), this.actions.init()]);
  }
  async activeAccount(accountId: string) {
    const account = await this.accounts.findOne(accountId);
    if (!account?.isActive || account.isRemoved || !account.tenantId) throw new ForbiddenException('WhatsApp account is unavailable.');
    const tenant = await this.tenants.findById(account.tenantId);
    if (!tenant || tenant.status !== 'active') throw new ForbiddenException('Client account is inactive.');
    return account;
  }
  async authenticate(rawKey: unknown) {
    if (typeof rawKey !== 'string' || !/^wms_zap_[A-Za-z0-9_-]{43}$/.test(rawKey)) throw new UnauthorizedException('Invalid Zapier API key.');
    const keyHash = secretHash(rawKey);
    const existing = await this.connections.findOne({ keyHash, enabled: true });
    if (!existing) throw new UnauthorizedException('Invalid or revoked Zapier API key.');
    const account = await this.activeAccount(String(existing.whatsappAccountId));
    const rateWindow = Math.floor(Date.now() / 60000);
    const current = await this.connections.findOneAndUpdate({ _id: existing._id, keyHash, enabled: true }, [{ $set: {
      requestCount: { $cond: [{ $eq: ['$rateWindow', rateWindow] }, { $add: [{ $ifNull: ['$requestCount', 0] }, 1] }, 1] },
      rateWindow, lastUsedAt: '$$NOW',
    } }], { new: true });
    if (!current) throw new UnauthorizedException('Zapier API key was revoked.');
    if (current.requestCount > 60) throw new HttpException('Zapier API limit reached. Retry after one minute using the same requestId.', 429);
    return { accountId: String(account._id), accountName: account.name };
  }
  async status(accountId: string) {
    const [connection, hooks, deliveries, actions] = await Promise.all([
      this.connections.findOne({ whatsappAccountId: accountId }).select('enabled keyHint lastUsedAt').lean(),
      this.hooks.find({ whatsappAccountId: accountId }).select('-cursors -scanLockOwner -scanLockedUntil').sort({ createdAt: -1 }).lean(),
      this.deliveries.find({ whatsappAccountId: accountId }).select('-payload -lockOwner').sort({ createdAt: -1 }).limit(30).lean(),
      this.actions.find({ whatsappAccountId: accountId }).select('requestId kind status error createdAt').sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    return { enabled: connection?.enabled || false, keyHint: connection?.keyHint, lastUsedAt: connection?.lastUsedAt, hooks, deliveries, actions };
  }
  async generateKey(accountId: string) {
    await this.activeAccount(accountId);
    const apiKey = `wms_zap_${randomBytes(32).toString('base64url')}`;
    await this.connections.findOneAndUpdate({ whatsappAccountId: accountId }, { $set: {
      keyHash: secretHash(apiKey), keyHint: `wms_zap_…${apiKey.slice(-6)}`, enabled: true,
    } }, { upsert: true });
    return { apiKey, message: 'Save this API key now. It will not be displayed again. Any previous key is revoked.' };
  }
  async revoke(accountId: string) {
    await this.connections.updateOne({ whatsappAccountId: accountId }, { $set: { enabled: false }, $unset: { keyHash: 1, keyHint: 1 } });
    await this.hooks.updateMany({ whatsappAccountId: accountId }, { $set: { enabled: false }, $inc: { revision: 1 } });
    await this.deliveries.updateMany({ whatsappAccountId: accountId, status: { $in: ['pending', 'processing'] } }, { status: 'canceled', lastError: 'Integration disconnected.' });
    return { disconnected: true };
  }
  async createHook(accountId: string, dto: CreateZapierHookDto) {
    const url = normalizeHookUrl(dto.url);
    if (!dto.name.trim()) throw new BadRequestException('Name your Zap.');
    if (!await this.connections.exists({ whatsappAccountId: accountId, enabled: true })) throw new BadRequestException('Generate an API key to enable Zapier first.');
    if (await this.hooks.countDocuments({ whatsappAccountId: accountId }) >= 10) throw new BadRequestException('Use up to 10 Zapier hooks per WhatsApp account.');
    const hook = await this.hooks.create({ whatsappAccountId: toObjectId(accountId), name: dto.name.trim(), event: dto.event, url, startsAt: new Date() });
    return { id: hook._id };
  }
  private async ownedHook(accountId: string, id: string) {
    const hook = await this.hooks.findOne({ _id: toObjectId(id, 'hookId'), whatsappAccountId: accountId });
    if (!hook) throw new NotFoundException('Zapier hook not found.');
    return hook;
  }
  async toggleHook(accountId: string, id: string, enabled: boolean) {
    const hook = await this.ownedHook(accountId, id);
    if (enabled && !await this.connections.exists({ whatsappAccountId: accountId, enabled: true })) throw new BadRequestException('Enable the Zapier connection first.');
    if (hook.enabled === enabled) return { enabled };
    await this.hooks.updateOne({ _id: hook._id }, { $set: { enabled, startsAt: new Date(), cursors: {}, lastError: '' }, $inc: { revision: 1 } });
    if (!enabled) await this.deliveries.updateMany({ hookId: hook._id, status: { $in: ['pending', 'processing'] } }, { status: 'canceled', lastError: 'Hook paused.' });
    return { enabled };
  }
  async removeHook(accountId: string, id: string) {
    const hook = await this.ownedHook(accountId, id);
    await this.hooks.deleteOne({ _id: hook._id });
    await this.deliveries.updateMany({ hookId: hook._id, status: { $in: ['pending', 'processing'] } }, { status: 'canceled', lastError: 'Hook removed.' });
    return { removed: true };
  }
  async testHook(accountId: string, id: string) {
    const hook = await this.ownedHook(accountId, id);
    if (!hook.enabled || !await this.connections.exists({ whatsappAccountId: accountId, enabled: true })) throw new BadRequestException('Enable this hook and connection first.');
    const eventId = `test_${randomBytes(12).toString('hex')}`;
    const common = { id: 'sample-record', phone: '+12025550123', name: 'Sample contact' };
    const data = hook.event === 'contact.created' ? { ...common, tags: ['sample'], customFields: {} }
      : hook.event === 'message.received' ? { ...common, type: 'text', text: 'Sample incoming WhatsApp message', waMessageId: 'sample-wa-message' }
      : { ...common, source: 'inbox', status: 'delivered', waMessageId: 'sample-wa-message' };
    await this.deliveries.create({ whatsappAccountId: hook.whatsappAccountId, hookId: hook._id, hookRevision: hook.revision, eventId,
      payload: { id: eventId, event: hook.event, test: true, whatsappAccountId: accountId, occurredAt: new Date().toISOString(), data } });
    return { queued: true, eventId };
  }
  async retryDelivery(accountId: string, id: string) {
    const delivery = await this.deliveries.findOne({ _id: toObjectId(id, 'deliveryId'), whatsappAccountId: accountId, status: 'failed' });
    if (!delivery) throw new BadRequestException('Only failed deliveries can be retried.');
    const hook = await this.ownedHook(accountId, String(delivery.hookId));
    if (!hook.enabled || !await this.connections.exists({ whatsappAccountId: accountId, enabled: true })) throw new BadRequestException('Enable the hook and connection first.');
    if (delivery.hookRevision !== hook.revision) throw new BadRequestException('This delivery belongs to an earlier hook session and cannot be retried.');
    await this.deliveries.updateOne({ _id: delivery._id, status: 'failed' }, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: '' });
    return { queued: true };
  }
  async listTemplates(accountId: string) {
    const templates = await this.templates.findAll(accountId);
    return templates.flatMap(template => {
      try { return [{ name: template.name, language: template.language, bodyParameterCount: templateParameterCount(template),
        body: template.components?.find(c => c.type === 'BODY')?.text || '' }]; } catch { return []; }
    });
  }
  private async once(accountId: string, requestId: string, kind: string, body: any, execute: () => Promise<Record<string, any>>) {
    const fingerprint = secretHash(canonicalJson({ kind, body }));
    const filter = { whatsappAccountId: accountId, requestId };
    const replay = (previous: any) => {
      if (previous.fingerprint !== fingerprint) throw new ConflictException('This requestId was already used with different data.');
      if (previous.status === 'completed') return previous.result;
      throw new ConflictException('This request was already attempted. Check WMS action history and Inbox before retrying with a new requestId.');
    };
    const previous = await this.actions.findOne(filter);
    if (previous) return replay(previous);
    let action;
    try { action = await this.actions.create({ ...filter, kind, fingerprint }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      const duplicate = await this.actions.findOne(filter);
      if (!duplicate) throw new ConflictException('Request is being processed.');
      return replay(duplicate);
    }
    try {
      // Check revocation again immediately before actions with side effects.
      if (!await this.connections.exists({ whatsappAccountId: accountId, enabled: true })) throw new ForbiddenException('Zapier is disconnected.');
      const result = await execute();
      await this.actions.updateOne({ _id: action._id }, { status: 'completed', result });
      return result;
    } catch (error) {
      const message = error instanceof BadRequestException || error instanceof ForbiddenException ? error.message
        : 'Action did not complete. Check Inbox and wallet before attempting it again.';
      await this.actions.updateOne({ _id: action._id }, { status: 'needs_review', error: message });
      throw new BadRequestException(message);
    }
  }
  async upsertContact(accountId: string, dto: ZapierContactDto) {
    const customFields = dto.customFields === undefined ? undefined : safeCustomFields(dto.customFields);
    const body: any = { phone: dto.phone };
    if (dto.name !== undefined) body.name = dto.name;
    if (dto.tags !== undefined) body.tags = dto.tags;
    if (customFields !== undefined) body.customFields = customFields;
    return this.once(accountId, dto.requestId, 'contact.upsert', body, async () => {
      const existing = await this.contactModel.findOne({ ...whatsappAccountIdFilter(accountId), phone: dto.phone });
      if (existing && !existing.isActive) throw new BadRequestException('This contact is inactive. Update it in WMS first.');
      const input = { ...body };
      if (existing && customFields) input.customFields = { ...existing.customFields, ...customFields };
      const contact = existing ? await this.contacts.update(String(existing._id), input)
        : await this.contacts.create({ ...input, whatsappAccountId: accountId });
      return { id: String(contact._id), phone: contact.phone, name: contact.name || '', created: !existing };
    });
  }
  async sendTemplate(accountId: string, dto: ZapierSendDto) {
    return this.once(accountId, dto.requestId, 'message.template', {
      phone: dto.phone, templateName: dto.templateName, bodyParameters: dto.bodyParameters, consent: dto.consent,
    }, async () => {
      if (dto.consent !== true) throw new BadRequestException('Confirm WhatsApp messaging consent.');
      const contact = await this.contactModel.findOne({ ...whatsappAccountIdFilter(accountId), phone: dto.phone });
      if (contact && (!contact.isActive || contact.isOptedOut)) throw new BadRequestException('This contact is inactive or opted out of WhatsApp messages.');
      const template = await this.templates.findByName(accountId, dto.templateName);
      const count = templateParameterCount(template);
      if (dto.bodyParameters.length !== count || dto.bodyParameters.some(value => !value.trim())) throw new BadRequestException(`Provide exactly ${count} non-empty body parameter values.`);
      const message = await this.inbox.sendTemplate(accountId, dto.phone, template.name, template.language, dto.bodyParameters);
      return { id: String(message._id), waMessageId: message.waMessageId || '', status: message.deliveryStatus || 'pending', phone: dto.phone };
    });
  }
}
