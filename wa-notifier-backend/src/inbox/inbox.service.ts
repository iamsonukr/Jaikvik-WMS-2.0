import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './message.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';
import { TemplatesService } from '../templates/templates.service';
import { WalletService } from '../wallet/wallet.service';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { Plan, PlanDocument } from '../plans/plan.schema';
import { MessageCategory } from '../common/enums/message-category.enum';

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(Message.name) private model: Model<MessageDocument>,
    private meta: MetaService,
    private clients: WhatsAppAccountsService,
    private templates: TemplatesService,
    private wallet: WalletService,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
  ) {}

  /** All unique threads (latest message per phone) */
  async threads(whatsappAccountId: string) {
    return this.model.aggregate([
      { $match: this.whatsappAccountIdQuery(whatsappAccountId) },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$phone', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } },
      { $sort: { createdAt: -1 } },
    ]);
  }

  messages(whatsappAccountId: string, phone: string) {
    return this.model
      .find({ ...this.whatsappAccountIdQuery(whatsappAccountId), phone })
      .sort({ createdAt: 1 })
      .limit(200);
  }

  save(dto: Partial<Message>) { return this.model.create(dto); }

  async reply(whatsappAccountId: string, phone: string, text: string) {
    const account = await this.clients.findOne(whatsappAccountId);
    if (!account) throw new NotFoundException('WhatsApp account not found.');

    const tenantId = this.resolveTenantId(account);
    const price = await this.resolvePlanPrice(String(tenantId), MessageCategory.SERVICE);
    const charge = this.totalForOneMessage(price);
    const txn = charge > 0
      ? await this.wallet.debitForMessage(tenantId, charge, {
          description: `Service message sent to ${phone}`,
          referenceId: phone,
          messageCategory: MessageCategory.SERVICE,
          appliedUnitPrice: price.sellingPrice,
          tax: price.taxPercent,
        })
      : null;

    let res: any;
    try {
      res = await this.meta.sendText(account.phoneNumberId, account.accessToken, phone, text);
    } catch (err) {
      await this.refundFailedSend(tenantId, charge, phone, MessageCategory.SERVICE, 'text reply');
      throw err;
    }

    return this.model.create({
      whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
      tenantId,
      phone,
      direction: 'outbound',
      type: 'text',
      text,
      waMessageId: res?.messages?.[0]?.id,
      messageCategory: MessageCategory.SERVICE,
      appliedUnitPrice: price.sellingPrice,
      appliedTaxPercent: price.taxPercent,
      chargedAmount: charge,
      walletTransactionId: txn?._id,
      timestamp: new Date(),
    });
  }

  async sendTemplate(
    whatsappAccountId: string,
    phone: string,
    templateName: string,
    languageCode?: string,
    bodyParameters: string[] = [],
  ) {
    const account = await this.clients.findOne(whatsappAccountId);
    if (!account) throw new NotFoundException('WhatsApp account not found.');
    const template = await this.templates.findByName(whatsappAccountId, templateName);
    if (!template) throw new BadRequestException('Template not found for this WhatsApp account.');
    if (String(template.status || '').toLowerCase() !== 'approved') {
      throw new BadRequestException('Only approved templates can be sent.');
    }

    const category = this.normalizeCategory(template.category);
    const tenantId = this.resolveTenantId(account);
    const price = await this.resolvePlanPrice(String(tenantId), category);
    const charge = this.totalForOneMessage(price);
    const txn = charge > 0
      ? await this.wallet.debitForMessage(tenantId, charge, {
          description: `${category} template "${template.name}" sent to ${phone}`,
          referenceId: phone,
          messageCategory: category,
          appliedUnitPrice: price.sellingPrice,
          tax: price.taxPercent,
        })
      : null;

    const language = languageCode || template.language || 'en';
    const components = this.buildSendComponents(template.components || [], bodyParameters);
    let res: any;
    try {
      res = await this.meta.sendTemplate(
        account.phoneNumberId,
        account.accessToken,
        phone,
        template.name,
        language,
        components,
      );
    } catch (err) {
      await this.refundFailedSend(tenantId, charge, phone, category, `template "${template.name}"`);
      throw err;
    }

    const body = template.components?.find((component: any) => component?.type === 'BODY')?.text || template.name;
    return this.model.create({
      whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
      tenantId,
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
      messageCategory: category,
      appliedUnitPrice: price.sellingPrice,
      appliedTaxPercent: price.taxPercent,
      chargedAmount: charge,
      walletTransactionId: txn?._id,
      timestamp: new Date(),
    });
  }

  assign(id: string, userId: string) {
    return this.model.findByIdAndUpdate(id, { assignedTo: toObjectId(userId, 'userId'), threadStatus: 'assigned' }, { new: true });
  }

  resolve(whatsappAccountId: string, phone: string) {
    return this.model.updateMany({ ...this.whatsappAccountIdQuery(whatsappAccountId), phone }, { threadStatus: 'resolved' });
  }

  private whatsappAccountIdQuery(whatsappAccountId: string) {
    return whatsappAccountIdFilter(whatsappAccountId);
  }

  private resolveTenantId(client: any): Types.ObjectId {
    if (!client?.tenantId) {
      throw new BadRequestException('This WhatsApp account is not linked to a client tenant, so wallet billing cannot be applied.');
    }
    return toObjectId(client.tenantId, 'tenantId');
  }

  private normalizeCategory(category: unknown): MessageCategory {
    const raw = String(category || '').toLowerCase();
    if (raw === 'marketing') return MessageCategory.MARKETING;
    if (raw === 'authentication') return MessageCategory.AUTHENTICATION;
    if (raw === 'service') return MessageCategory.SERVICE;
    return MessageCategory.UTILITY;
  }

  private async resolvePlanPrice(tenantId: string, category: MessageCategory) {
    const tenant = await this.tenantModel.findById(toObjectId(tenantId, 'tenantId'));
    if (!tenant?.planId) {
      throw new NotFoundException('No active plan is assigned to this client.');
    }

    const plan = await this.planModel.findById(tenant.planId);
    if (!plan) throw new NotFoundException('Client plan not found.');

    const rawRate = plan.messageRates?.[category] ?? 0;
    const sellingPrice = Number(rawRate);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      throw new NotFoundException(`No valid ${category} message rate is configured for plan "${plan.name}".`);
    }

    return {
      sellingPrice,
      taxPercent: plan.taxPercent || 0,
    };
  }

  private totalForOneMessage(price: { sellingPrice: number; taxPercent: number }) {
    return Number((price.sellingPrice * (1 + price.taxPercent / 100)).toFixed(4));
  }

  private async refundFailedSend(tenantId: Types.ObjectId, charge: number, phone: string, category: MessageCategory, label: string) {
    if (charge <= 0) return;
    await this.wallet.refund(tenantId, charge, {
      description: `Refund for failed ${label} to ${phone}`,
      referenceId: phone,
      messageCategory: category,
    });
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
