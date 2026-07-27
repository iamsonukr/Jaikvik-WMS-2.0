import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly version: string;

  constructor(private cfg: ConfigService) {
    this.version = cfg.get('META_API_VERSION', 'v19.0');
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
    try {
      const { data } = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name: templateName, language: { code: languageCode }, components },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
      return data;
    } catch (err) {
      this.logger.error('Meta sendTemplate failed', err?.response?.data);
      throw err;
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
        fields: 'id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status',
        access_token: accessToken,
      },
    });
    return data;
  }

  async getWabaPhoneNumbers(wabaId: string, accessToken: string) {
    const { data } = await axios.get(`https://graph.facebook.com/${this.version}/${wabaId}/phone_numbers`, {
      params: {
        fields: 'id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status',
        access_token: accessToken,
      },
    });
    return data?.data || [];
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
        phoneNumberId,
      });
      throw new BadRequestException(`Could not register WhatsApp phone number: ${message}`);
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
