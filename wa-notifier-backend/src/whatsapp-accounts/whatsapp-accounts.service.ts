import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { EmbeddedSignupDto, PublicEmbeddedSignupDto } from './whatsapp-account.dto';
import { WhatsAppAccount, WhatsAppAccountDocument } from './whatsapp-account.schema';
import { MetaService } from '../common/meta.service';
import { ObjectIdInput, toObjectId } from '../common/mongo-id';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class WhatsAppAccountsService {
  private readonly logger = new Logger(WhatsAppAccountsService.name);

  constructor(
    @InjectModel(WhatsAppAccount.name) private model: Model<WhatsAppAccountDocument>,
    private cfg: ConfigService,
    private meta: MetaService,
    private subscriptions: SubscriptionsService,
  ) {}

  findAll() { return this.model.find().select('-accessToken'); }
  findAllByTenant(tenantId: ObjectIdInput) {
    return this.model.find({ tenantId: toObjectId(tenantId, 'tenantId') }).select('-accessToken');
  }
  findOne(id: string) { return this.model.findById(toObjectId(id, 'whatsappAccountId')); }
  findOnePublic(id: string) { return this.model.findById(toObjectId(id, 'whatsappAccountId')).select('-accessToken'); }
  findByPhoneNumberId(phoneNumberId: string) { return this.model.findOne({ phoneNumberId }); }
  findByMetaEntityId(entityId: string) { return this.model.findOne({ $or: [{ wabaId: entityId }, { phoneNumberId: entityId }] }); }
  async create(dto: Partial<Omit<WhatsAppAccount, 'tenantId'>> & { tenantId?: ObjectIdInput }, tenantId?: ObjectIdInput) {
    if (tenantId && dto.phoneNumberId) {
      await this.assertTenantCanAddPhoneNumber(tenantId, dto.phoneNumberId);
    }
    return this.model.create(tenantId ? { ...dto, tenantId: toObjectId(tenantId, 'tenantId') } : dto);
  }

  async createFromEmbeddedSignup(dto: EmbeddedSignupDto, tenantId?: ObjectIdInput) {
    const appId = this.cfg.get<string>('META_APP_ID');
    const appSecret = this.cfg.get<string>('META_APP_SECRET');
    const version = this.cfg.get<string>('META_API_VERSION', 'v19.0');

    if (!appId || !appSecret) {
      throw new BadRequestException('Meta App ID and App Secret are required for Embedded Signup.');
    }

    const accessToken = await this.exchangeSignupCode(dto.code, appId, appSecret, version);
    const phoneInfo = dto.phoneNumberId
      ? await this.getPhoneNumberInfo(dto.phoneNumberId, accessToken, version)
      : await this.getFirstPhoneNumberForWaba(dto.wabaId, accessToken, version);
    const phoneNumberId = dto.phoneNumberId || phoneInfo?.id;

    if (!phoneNumberId) {
      throw new BadRequestException('Meta did not return a WhatsApp phone number for this account.');
    }

    if (tenantId) {
      await this.assertTenantCanAddPhoneNumber(tenantId, phoneNumberId);
    }

    await this.meta.subscribeWaba(dto.wabaId, accessToken).catch(err => {
      this.logger.warn(err?.message || 'Could not subscribe WABA webhooks automatically');
    });

    const name = dto.name || phoneInfo?.verified_name || `WhatsApp ${phoneNumberId}`;
    const phone = phoneInfo?.display_phone_number || phoneInfo?.phone_number || undefined;

    const setFields: Record<string, any> = {
      name,
      wabaId: dto.wabaId,
      phoneNumberId,
      accessToken,
      phone,
      isActive: true,
    };
    if (tenantId) setFields.tenantId = toObjectId(tenantId, 'tenantId');

    const doc = await this.model.findOneAndUpdate(
      { phoneNumberId },
      {
        $set: setFields,
        $setOnInsert: {
          timezone: 'Asia/Kolkata',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('-accessToken');

    return doc;
  }

  private async assertTenantCanAddPhoneNumber(tenantIdInput: ObjectIdInput, phoneNumberId: string) {
    const tenantId = toObjectId(tenantIdInput, 'tenantId');
    const existing = await this.model.findOne({ phoneNumberId });

    if (existing) {
      if (existing.tenantId && String(existing.tenantId) === String(tenantId)) return;
      throw new BadRequestException('This WhatsApp number is already connected to another client.');
    }

    const subscription = await this.subscriptions.currentForTenant(String(tenantId));
    if (!subscription || new Date(subscription.endDate) < new Date()) {
      throw new BadRequestException('An active plan is required before connecting a WhatsApp number.');
    }

    const plan = subscription.planId as any;
    const limit = this.resolveWhatsAppNumberLimit(plan);
    if (limit === null) return;

    const currentCount = await this.model.countDocuments({ tenantId });
    if (currentCount >= limit) {
      throw new BadRequestException(
        `Your current plan allows ${limit} WhatsApp number${limit === 1 ? '' : 's'}. Upgrade your plan to connect more numbers.`,
      );
    }
  }

  private resolveWhatsAppNumberLimit(plan: any): number | null {
    const rawLimit = plan?.whatsappNumbers ?? plan?.limits?.whatsappNumbers;
    if (rawLimit === null || rawLimit === undefined || rawLimit === '') return null;
    const limit = Number(rawLimit);
    return Number.isFinite(limit) && limit >= 0 ? limit : null;
  }

  async createFromPublicEmbeddedSignup(dto: PublicEmbeddedSignupDto) {
    const expectedToken = this.cfg.get<string>('CLIENT_ONBOARDING_TOKEN');
    if (!expectedToken) {
      throw new BadRequestException('Public client onboarding is not configured.');
    }
    if (dto.inviteToken !== expectedToken) {
      throw new BadRequestException('This WhatsApp connect link is invalid or expired.');
    }

    return this.createFromEmbeddedSignup(dto);
  }

  private async exchangeSignupCode(code: string, appId: string, appSecret: string, version: string) {
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${version}/oauth/access_token`, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code,
        },
      });
      if (!data?.access_token) throw new Error('Meta did not return an access token.');
      return data.access_token;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Embedded Signup code exchange failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
      });
      throw new BadRequestException(`Could not complete Meta Embedded Signup: ${message}`);
    }
  }

  private async getPhoneNumberInfo(phoneNumberId: string, accessToken: string, version: string) {
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${version}/${phoneNumberId}`, {
        params: {
          fields: 'display_phone_number,verified_name',
          access_token: accessToken,
        },
      });
      return data;
    } catch (err) {
      this.logger.warn(`Could not fetch Meta phone number details: ${JSON.stringify(err?.response?.data || err?.message)}`);
      return null;
    }
  }

  private async getFirstPhoneNumberForWaba(wabaId: string, accessToken: string, version: string) {
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${version}/${wabaId}/phone_numbers`, {
        params: {
          fields: 'id,display_phone_number,verified_name',
          access_token: accessToken,
        },
      });
      return data?.data?.[0] || null;
    } catch (err) {
      this.logger.warn(`Could not fetch Meta WABA phone numbers: ${JSON.stringify(err?.response?.data || err?.message)}`);
      return null;
    }
  }

  async update(id: string, dto: Partial<WhatsAppAccount>) {
    // Don't overwrite accessToken with blank string from edit-form (frontend sends '' when unchanged)
    if (dto.accessToken === '' || dto.accessToken == null) delete dto.accessToken;
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true }).select('-accessToken');
    if (!doc) throw new NotFoundException();
    return doc;
  }
  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException();
    return { deleted: true };
  }

  async subscribeWebhooks(id: string) {
    const account = await this.findOne(id);
    if (!account) throw new NotFoundException();
    return this.meta.subscribeWaba(account.wabaId, account.accessToken);
  }

  async registerPhoneNumber(id: string, pin: string) {
    const account = await this.findOne(id);
    if (!account) throw new NotFoundException();
    return this.meta.registerPhoneNumber(account.phoneNumberId, account.accessToken, pin);
  }

  async diagnoseSending(id: string) {
    const account = await this.findOne(id);
    if (!account) throw new NotFoundException();

    const result: any = {
      client: {
        id: account._id,
        name: account.name,
        wabaId: account.wabaId,
        phoneNumberId: account.phoneNumberId,
        phone: account.phone,
      },
      phoneNumber: null,
      wabaPhoneNumbers: [],
      error: null,
    };

    try {
      result.phoneNumber = await this.meta.getPhoneNumberInfo(account.phoneNumberId, account.accessToken);
    } catch (err) {
      const metaError = err?.response?.data?.error;
      result.error = metaError?.message || err?.message || 'Could not fetch phone number status from Meta.';
    }

    try {
      result.wabaPhoneNumbers = await this.meta.getWabaPhoneNumbers(account.wabaId, account.accessToken);
    } catch (err) {
      const metaError = err?.response?.data?.error;
      result.wabaPhoneNumbersError = metaError?.message || err?.message || 'Could not fetch WABA phone numbers from Meta.';
    }

    return result;
  }
}
