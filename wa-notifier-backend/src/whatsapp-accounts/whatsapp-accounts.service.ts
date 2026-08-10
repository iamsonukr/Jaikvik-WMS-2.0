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
    const { tenantId: _requestTenantId, ...account } = dto;
    return this.model.create(tenantId ? { ...account, tenantId: toObjectId(tenantId, 'tenantId') } : account);
  }

  async createFromEmbeddedSignup(dto: EmbeddedSignupDto, tenantId?: ObjectIdInput) {
    const appId = this.cfg.get<string>('META_APP_ID');
    const appSecret = this.cfg.get<string>('META_APP_SECRET');
    const version = this.cfg.get<string>('META_API_VERSION', 'v19.0');

    if (!appId || !appSecret) {
      throw new BadRequestException('Meta App ID and App Secret are required for Embedded Signup.');
    }

    const signupAccessToken = await this.exchangeSignupCode(dto.code, appId, appSecret, version);
    const accessToken = await this.prepareProviderWabaAccess(dto.wabaId, signupAccessToken);
    const onboardingMode = this.normalizeOnboardingMode(dto.onboardingMode);
    if (onboardingMode === 'business_app' && !dto.phoneNumberId) {
      throw new BadRequestException(
        'Meta completed Business App onboarding without returning a phone number ID. Reopen the coexistence flow and complete the phone/QR linking step; do not finish with WABA-only access.',
      );
    }

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
      onboardingMode,
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

  private normalizeOnboardingMode(mode?: string) {
    return String(mode || '').trim().toLowerCase() === 'business_app' ? 'business_app' : 'cloud_api';
  }

  private providerAccessSettings() {
    const accessMode = this.cfg.get<string>('META_WABA_ACCESS_MODE', 'embedded_signup').trim().toLowerCase();
    const providerAssignmentEnabled = this.cfg.get<string>('META_ENABLE_PROVIDER_ASSIGNMENT', 'false').trim().toLowerCase() === 'true';
    return { accessMode, providerAssignmentEnabled };
  }

  private async prepareProviderWabaAccess(wabaId: string, fallbackAccessToken: string) {
    const { accessMode, providerAssignmentEnabled } = this.providerAccessSettings();
    if (!providerAssignmentEnabled) return fallbackAccessToken;
    if (!['provider_assignment', 'multi_partner'].includes(accessMode)) return fallbackAccessToken;

    const configuredSystemUserId = this.cfg.get<string>('META_PROVIDER_SYSTEM_USER_ID');
    const providerAccessToken = this.cfg.get<string>('META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN');

    if (!providerAccessToken) {
      throw new BadRequestException(
        'META_PROVIDER_SYSTEM_USER_ACCESS_TOKEN is required when META_WABA_ACCESS_MODE uses provider assignment.',
      );
    }

    const providerSystemUserId = await this.resolveProviderSystemUserId(providerAccessToken, configuredSystemUserId);
    const tasks = this.parseProviderSystemUserTasks();
    await this.meta.assignSystemUserToWaba(wabaId, providerSystemUserId, providerAccessToken, tasks);
    await this.attachProviderCreditLineIfConfigured(wabaId, providerAccessToken);
    return providerAccessToken;
  }

  private async resolveProviderSystemUserId(providerAccessToken: string, configuredSystemUserId?: string) {
    const providerBusinessId = this.cfg.get<string>('META_PROVIDER_BUSINESS_ID');
    if (!providerBusinessId) {
      if (!configuredSystemUserId) {
        throw new BadRequestException(
          'META_PROVIDER_SYSTEM_USER_ID is required when META_PROVIDER_BUSINESS_ID is not configured.',
        );
      }
      return configuredSystemUserId;
    }

    const users = await this.meta.getBusinessSystemUsers(providerBusinessId, providerAccessToken);
    if (!users.length) {
      throw new BadRequestException('No system users were found in the configured provider business.');
    }

    if (!configuredSystemUserId && users.length === 1) return users[0].id;

    const selected = configuredSystemUserId
      ? users.find((user) => String(user.id) === String(configuredSystemUserId))
      : null;
    if (selected) return selected.id;

    const available = users
      .map((user) => `${user.name || 'Unnamed system user'} (${user.id})`)
      .join(', ');
    throw new BadRequestException(
      configuredSystemUserId
        ? `META_PROVIDER_SYSTEM_USER_ID was not found in META_PROVIDER_BUSINESS_ID. Use one of: ${available}`
        : `Multiple provider system users found. Set META_PROVIDER_SYSTEM_USER_ID to one of: ${available}`,
    );
  }

  private parseProviderSystemUserTasks() {
    const configured = this.cfg.get<string>('META_WABA_SYSTEM_USER_TASKS', 'MANAGE');
    const tasks = configured
      .split(',')
      .map((task) => task.trim().toUpperCase())
      .filter(Boolean);
    const selected = tasks.length ? tasks : ['MANAGE'];
    if (!selected.includes('MESSAGING')) selected.push('MESSAGING');
    return selected;
  }

  private async attachProviderCreditLineIfConfigured(wabaId: string, providerAccessToken: string) {
    const creditLineId = this.cfg.get<string>('META_CREDIT_LINE_ID');
    if (!creditLineId) return;

    const currency = this.cfg.get<string>('META_WABA_CURRENCY');
    if (!currency) {
      throw new BadRequestException('META_WABA_CURRENCY is required when META_CREDIT_LINE_ID is configured.');
    }

    await this.meta.attachCreditLineToWaba(creditLineId, wabaId, currency, providerAccessToken);
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
    const accessToken = await this.prepareProviderWabaAccess(account.wabaId, account.accessToken);
    await this.persistAccessTokenIfChanged(account, accessToken);
    return this.meta.subscribeWaba(account.wabaId, accessToken);
  }

  async registerPhoneNumber(id: string, pin: string) {
    const account = await this.findOne(id);
    if (!account) throw new NotFoundException();
    if (account.onboardingMode === 'business_app') {
      throw new BadRequestException('Business App coexistence numbers are linked during Embedded Signup and do not use the standard register-number step.');
    }
    const accessToken = await this.prepareProviderWabaAccess(account.wabaId, account.accessToken);
    await this.persistAccessTokenIfChanged(account, accessToken);
    return this.meta.registerPhoneNumber(account.phoneNumberId, accessToken, pin);
  }

  private async persistAccessTokenIfChanged(account: WhatsAppAccountDocument, accessToken: string) {
    if (account.accessToken === accessToken) return;
    account.accessToken = accessToken;
    await account.save();
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
        onboardingMode: account.onboardingMode || 'cloud_api',
      },
      phoneNumber: null,
      wabaPhoneNumbers: [],
      token: null,
      configuration: {
        ...this.providerAccessSettings(),
        providerTasks: this.parseProviderSystemUserTasks(),
      },
      warnings: [],
      error: null,
    };

    try {
      const debug = await this.meta.debugAccessToken(account.accessToken);
      const scopes = Array.isArray(debug?.scopes) ? debug.scopes : [];
      const granularScopes = Array.isArray(debug?.granular_scopes) ? debug.granular_scopes : [];
      result.token = {
        appId: debug?.app_id,
        type: debug?.type,
        isValid: debug?.is_valid,
        expiresAt: debug?.expires_at,
        scopes,
        hasWhatsappBusinessManagement: scopes.includes('whatsapp_business_management'),
        hasWhatsappBusinessMessaging: scopes.includes('whatsapp_business_messaging'),
        granularScopes: granularScopes.map((scope) => ({
          scope: scope.scope,
          targetIds: scope.target_ids || [],
        })),
      };
      const embeddedSignupMode = result.configuration.accessMode === 'embedded_signup'
        && !result.configuration.providerAssignmentEnabled;
      if (embeddedSignupMode && debug?.type === 'SYSTEM_USER' && Number(debug?.expires_at || 0) === 0) {
        result.warnings.push(
          'Saved token is non-expiring. If your Embedded Signup configuration says tokens expire in 60 days, this account may still be using a provider/manual system-user token instead of the customer Embedded Signup token.',
        );
      }
    } catch (err) {
      const metaError = err?.response?.data?.error;
      result.tokenError = metaError?.message || err?.message || 'Could not debug the saved Meta token.';
    }

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
