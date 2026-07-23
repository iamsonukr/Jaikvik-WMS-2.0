import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './message.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { legacyObjectIdFilter, toObjectId } from '../common/mongo-id';
import { TemplatesService } from '../templates/templates.service';

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(Message.name) private model: Model<MessageDocument>,
    private meta: MetaService,
    private clients: WhatsAppAccountsService,
    private templates: TemplatesService,
  ) {}

  /** All unique threads (latest message per phone) */
  async threads(clientId: string) {
    return this.model.aggregate([
      { $match: this.clientIdQuery(clientId) },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$phone', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } },
      { $sort: { createdAt: -1 } },
    ]);
  }

  messages(clientId: string, phone: string) {
    return this.model
      .find({ ...this.clientIdQuery(clientId), phone })
      .sort({ createdAt: 1 })
      .limit(200);
  }

  save(dto: Partial<Message>) { return this.model.create(dto); }

  async reply(clientId: string, phone: string, text: string) {
    const client = await this.clients.findOne(clientId);
    const res = await this.meta.sendText(client.phoneNumberId, client.accessToken, phone, text);
    return this.model.create({
      clientId: toObjectId(clientId, 'clientId'),
      tenantId: client?.tenantId,
      phone,
      direction: 'outbound',
      type: 'text',
      text,
      waMessageId: res?.messages?.[0]?.id,
      timestamp: new Date(),
    });
  }

  async sendTemplate(
    clientId: string,
    phone: string,
    templateName: string,
    languageCode?: string,
    bodyParameters: string[] = [],
  ) {
    const client = await this.clients.findOne(clientId);
    const template = await this.templates.findByName(clientId, templateName);
    if (!template) throw new BadRequestException('Template not found for this WhatsApp account.');
    if (String(template.status || '').toLowerCase() !== 'approved') {
      throw new BadRequestException('Only approved templates can be sent.');
    }

    const language = languageCode || template.language || 'en';
    const components = this.buildSendComponents(template.components || [], bodyParameters);
    const res = await this.meta.sendTemplate(
      client.phoneNumberId,
      client.accessToken,
      phone,
      template.name,
      language,
      components,
    );

    const body = template.components?.find((component: any) => component?.type === 'BODY')?.text || template.name;
    return this.model.create({
      clientId: toObjectId(clientId, 'clientId'),
      tenantId: client?.tenantId,
      phone,
      direction: 'outbound',
      type: 'template',
      text: body,
      media: {
        templateName: template.name,
        languageCode: language,
        bodyParameters,
      },
      waMessageId: res?.messages?.[0]?.id,
      timestamp: new Date(),
    });
  }

  assign(id: string, userId: string) {
    return this.model.findByIdAndUpdate(id, { assignedTo: toObjectId(userId, 'userId'), threadStatus: 'assigned' }, { new: true });
  }

  resolve(clientId: string, phone: string) {
    return this.model.updateMany({ ...this.clientIdQuery(clientId), phone }, { threadStatus: 'resolved' });
  }

  private clientIdQuery(clientId: string) {
    return legacyObjectIdFilter('clientId', clientId);
  }

  private buildSendComponents(templateComponents: any[], bodyParameters: string[]) {
    const body = templateComponents.find((component: any) => component?.type === 'BODY')?.text || '';
    const placeholderCount = this.placeholderCount(body);
    if (!placeholderCount) return [];

    const values = bodyParameters.map((value) => String(value || '').trim());
    if (values.length < placeholderCount || values.slice(0, placeholderCount).some((value) => !value)) {
      throw new BadRequestException(`Provide ${placeholderCount} body parameter value(s) for this template.`);
    }

    return [{
      type: 'body',
      parameters: values.slice(0, placeholderCount).map((text) => ({ type: 'text', text })),
    }];
  }

  private placeholderCount(text: string) {
    const matches = [...String(text || '').matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    return matches.length ? Math.max(...matches) : 0;
  }
}
