import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { EmbeddedSignupDto, PublicEmbeddedSignupDto } from './whatsapp-account.dto';
import { WhatsAppAccount, WhatsAppAccountDocument } from './whatsapp-account.schema';
import { MetaService } from '../common/meta.service';

@Injectable()
export class WhatsAppAccountsService {
  private readonly logger = new Logger(WhatsAppAccountsService.name);

  constructor(
    @InjectModel(WhatsAppAccount.name) private model: Model<WhatsAppAccountDocument>,
    private cfg: ConfigService,
    private meta: MetaService,
  ) {}

  findAll() { return this.model.find().select('-accessToken'); }
  findAllByTenant(tenantId: any) { return this.model.find({ tenantId }).select('-accessToken'); }
  findOne(id: string) { return this.model.findById(id); }
  findOnePublic(id: string) { return this.model.findById(id).select('-accessToken'); }
  findByPhoneNumberId(phoneNumberId: string) { return this.model.findOne({ phoneNumberId }); }
  findByMetaEntityId(entityId: string) { return this.model.findOne({ $or: [{ wabaId: entityId }, { phoneNumberId: entityId }] }); }
  create(dto: Partial<WhatsAppAccount>, tenantId?: any) {
    return this.model.create(tenantId ? { ...dto, tenantId } : dto);
  }

  async createFromEmbeddedSignup(dto: EmbeddedSignupDto, tenantId?: any) {
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
    if (tenantId) setFields.tenantId = tenantId;

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
