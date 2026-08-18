import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly version: string;

  constructor(private cfg: ConfigService) {
    this.version = cfg.get('META_API_VERSION', 'v25.0');
  }

  private base(phoneNumberId: string) {
    return `https://graph.facebook.com/${this.version}/${phoneNumberId}`;
  }

  async sendTemplate(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
  ) {
    const url = `${this.base(phoneNumberId)}/messages`;
    const recipient = this.normalizeRecipient(to);
    try {
      const { data } = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: { name: templateName, language: { code: languageCode }, components },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta sendTemplate failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        phoneNumberId,
        recipient,
        templateName,
      });
      if (metaError?.code === 200) {
        throw new BadRequestException(
          `WhatsApp template failed: ${message} | code ${metaError.code}${metaError?.error_subcode ? ` | subcode ${metaError.error_subcode}` : ''}`,
        );
      }
      throw new BadRequestException(`WhatsApp template failed: ${message}`);
    }
  }

  async sendText(phoneNumberId: string, accessToken: string, to: string, body: string) {
    const url = `${this.base(phoneNumberId)}/messages`;
    const recipient = this.normalizeRecipient(to);
    try {
      const { data } = await axios.post(
        url,
        { messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body } },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta sendText failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        recipient,
      });
      if (metaError?.code === 200) {
        throw new BadRequestException(
          `WhatsApp message failed: ${message} | code ${metaError.code}${metaError?.error_subcode ? ` | subcode ${metaError.error_subcode}` : ''}`,
        );
      }
      throw new BadRequestException(`WhatsApp message failed: ${message}`);
    }
  }

  async getTemplates(wabaId: string, accessToken: string) {
    const url = `https://graph.facebook.com/${this.version}/${wabaId}/message_templates`;
    const { data } = await axios.get(url, {
      params: {
        limit: 100,
        fields: 'name,category,language,status,components,rejected_reason,quality_score,previous_category,parameter_format',
      },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data.data;
  }

  async getTemplateLibrary(accessToken: string, filters: Record<string, any> = {}) {
    const params = Object.fromEntries(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, String(value)]),
    );

    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/message_template_library`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data;
  }

  async createTemplate(wabaId: string, accessToken: string, payload: any) {
    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/${this.version}/${wabaId}/message_templates`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta createTemplate failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        wabaId,
      });
      throw new BadRequestException(`Could not create WhatsApp template: ${message}`);
    }
  }

  async getPhoneNumberInfo(phoneNumberId: string, accessToken: string) {
    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/${phoneNumberId}`, {
      params: {
        fields: 'id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,is_on_biz_app',
        access_token: accessToken,
      },
    });
    return data;
  }

  async getWabaPhoneNumbers(wabaId: string, accessToken: string) {
    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/${wabaId}/phone_numbers`, {
      params: {
        fields: 'id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,is_on_biz_app',
        access_token: accessToken,
      },
    });
    return data?.data || [];
  }

  async getWabaInfo(wabaId: string, accessToken: string) {
    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/${wabaId}`, {
      params: {
        fields: 'id,name,timezone_id,message_template_namespace,owner_business_info',
        access_token: accessToken,
      },
    });
    return data;
  }

  async getAssignedUsers(wabaId: string, accessToken: string, businessId?: string) {
    const params: Record<string, string> = {
      fields: 'id,name,role,tasks',
      access_token: accessToken,
    };
    if (businessId) params.business = businessId;

    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/${wabaId}/assigned_users`, {
      params,
    });
    return data?.data || [];
  }

  async debugAccessToken(inputToken: string) {
    const appId = this.cfg.get<string>('META_APP_ID');
    const appSecret = this.cfg.get<string>('META_APP_SECRET');
    if (!appId || !appSecret) {
      throw new BadRequestException('Meta App ID and App Secret are required to debug access tokens.');
    }

    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/debug_token`, {
      params: {
        input_token: inputToken,
        access_token: `${appId}|${appSecret}`,
      },
    });
    return data?.data;
  }

  async subscribeWaba(wabaId: string, accessToken: string) {
    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/${this.version}/${wabaId}/subscribed_apps`,
        null,
        { params: { access_token: accessToken } },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta subscribeWaba failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        wabaId,
      });
      throw new BadRequestException(`Could not subscribe WABA webhooks: ${message}`);
    }
  }

  async assignSystemUserToWaba(
    wabaId: string,
    systemUserId: string,
    accessToken: string,
    tasks: string[] = ['MANAGE'],
  ) {
    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/${this.version}/${wabaId}/assigned_users`,
        null,
        {
          params: {
            user: systemUserId,
            tasks: JSON.stringify(tasks),
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta assignSystemUserToWaba failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        wabaId,
        systemUserId,
      });
      throw new BadRequestException(`Could not assign provider system user to WABA: ${message}`);
    }
  }

  async getBusinessSystemUsers(businessId: string, accessToken: string) {
    try {
      const { data } = await axios.get(
        `https://graph.facebook.com/${this.version}/${businessId}/system_users`,
        {
          params: {
            fields: 'id,name,role',
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return data?.data || [];
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta getBusinessSystemUsers failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        businessId,
      });
      throw new BadRequestException(`Could not fetch provider business system users: ${message}`);
    }
  }

  async attachCreditLineToWaba(creditLineId: string, wabaId: string, currency: string, accessToken: string) {
    try {
      const { data } = await axios.post(
        `https://graph.facebook.com/${this.version}/${creditLineId}/whatsapp_credit_sharing_and_attach`,
        null,
        {
          params: {
            waba_id: wabaId,
            waba_currency: currency,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta attachCreditLineToWaba failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        creditLineId,
        wabaId,
      });
      throw new BadRequestException(`Could not attach provider credit line to WABA: ${message}`);
    }
  }

  async getPricingAnalytics(
    wabaId: string,
    accessToken: string,
    start: number,
    end: number,
    options: {
      granularity?: 'DAILY' | 'HALF_HOUR' | 'MONTHLY';
      metricTypes?: string[];
      dimensions?: string[];
    } = {},
  ) {
    const version = this.cfg.get<string>('META_PRICING_API_VERSION', this.version);
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${version}/${wabaId}/pricing_analytics`, {
        params: {
          start,
          end,
          granularity: options.granularity || 'DAILY',
          metric_types: JSON.stringify(options.metricTypes || ['COST', 'VOLUME']),
          dimensions: JSON.stringify(options.dimensions || ['COUNTRY', 'PRICING_CATEGORY', 'PHONE']),
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta getPricingAnalytics failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        wabaId,
      });
      throw new BadRequestException(`Could not fetch Meta pricing analytics: ${message}`);
    }
  }

  async registerPhoneNumber(phoneNumberId: string, accessToken: string, pin: string) {
    try {
      const { data } = await axios.post(
        `${this.base(phoneNumberId)}/register`,
        { messaging_product: 'whatsapp', pin },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
      return data;
    } catch (err) {
      const metaError = err?.response?.data?.error;
      const message = metaError?.error_data?.details || metaError?.message || err?.message || 'Unknown Meta error';
      this.logger.error('Meta registerPhoneNumber failed', {
        message,
        type: metaError?.type,
        code: metaError?.code,
        subcode: metaError?.error_subcode,
        details: metaError?.error_data?.details,
        userTitle: metaError?.error_user_title,
        userMessage: metaError?.error_user_msg,
        phoneNumberId,
      });
      if (metaError?.code === 100 && String(message).includes('Need either permission')) {
        throw new BadRequestException(
          'Could not register WhatsApp phone number: the saved Embedded Signup token cannot manage this WABA. Reconnect using a Facebook user with full admin access to the client business/WABA and make sure the Meta login configuration grants whatsapp_business_management.',
        );
      }
      const parts = [
        `Could not register WhatsApp phone number: ${message}`,
        metaError?.code ? `code ${metaError.code}` : '',
        metaError?.error_subcode ? `subcode ${metaError.error_subcode}` : '',
        metaError?.error_data?.details ? `details: ${metaError.error_data.details}` : '',
        metaError?.error_user_msg ? `user message: ${metaError.error_user_msg}` : '',
      ].filter(Boolean);
      throw new BadRequestException(parts.join(' | '));
    }
  }

  async markRead(phoneNumberId: string, accessToken: string, messageId: string) {
    await axios.post(
      `${this.base(phoneNumberId)}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  private normalizeRecipient(phone: string) {
    return String(phone || '').replace(/[^\d]/g, '');
  }
}
