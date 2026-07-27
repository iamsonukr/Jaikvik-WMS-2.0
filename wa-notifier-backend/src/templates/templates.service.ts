import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template, TemplateDocument } from './template.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { resolveWhatsAppAccountId, toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';
import { CreateTemplateDto } from './template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private model: Model<TemplateDocument>,
    private meta: MetaService,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(whatsappAccountId: string) {
    return this.model.find(this.whatsappAccountIdQuery(whatsappAccountId));
  }

  findByName(whatsappAccountId: string, name: string) {
    return this.model.findOne({ ...this.whatsappAccountIdQuery(whatsappAccountId), name });
  }

  async create(whatsappAccountIdInput: string, dto: CreateTemplateDto) {
    const whatsappAccountId = String(resolveWhatsAppAccountId(whatsappAccountIdInput || dto));
    const account = await this.clients.findOne(whatsappAccountId);
    if (!account) throw new NotFoundException('WhatsApp account not found.');

    const name = this.normalizeTemplateName(dto.name);
    const isLibraryTemplate = Boolean(dto.libraryTemplateName?.trim());
    const components = isLibraryTemplate ? [] : this.buildTemplateComponents(dto);
    const payload = isLibraryTemplate
      ? this.buildLibraryTemplatePayload(name, dto)
      : {
          name,
          language: dto.language,
          category: dto.category,
          components,
        };

    const metaResponse = await this.meta.createTemplate(account.wabaId, account.accessToken, payload);
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');

    return this.model.findOneAndUpdate(
      { whatsappAccountId: accountObjectId, name },
      {
        $set: {
          whatsappAccountId: accountObjectId,
          tenantId: account.tenantId,
          name,
          category: metaResponse?.category || dto.category,
          language: dto.language,
          status: metaResponse?.status || 'PENDING',
          rejectionReason: this.extractRejectionReason(metaResponse),
          components: metaResponse?.components || components,
          rawMeta: { request: payload, response: metaResponse },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  async library(whatsappAccountId: string, filters: Record<string, any>) {
    const account = await this.clients.findOne(whatsappAccountId);
    if (!account) throw new NotFoundException('WhatsApp account not found.');

    const response = await this.meta.getTemplateLibrary(account.accessToken, {
      name_or_content: filters.name_or_content || filters.search,
      language: filters.language,
      topic: filters.topic,
      usecase: filters.usecase,
      industry: filters.industry,
      limit: filters.limit || 25,
      after: filters.after,
      before: filters.before,
    });

    return {
      ...response,
      data: (response?.data || []).filter((template: any) => this.matchesLibraryFilters(template, filters)),
    };
  }

  async sync(whatsappAccountId: string) {
    const account = await this.clients.findOne(whatsappAccountId);
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const metaTemplates = await this.meta.getTemplates(account.wabaId, account.accessToken);
    const ops = metaTemplates.map((t: any) => ({
      updateOne: {
        filter: { whatsappAccountId: accountObjectId, name: t.name },
        update: {
          $set: {
            whatsappAccountId: accountObjectId,
            tenantId: account.tenantId,
            name: t.name,
            category: t.category,
            language: t.language,
            status: t.status,
            rejectionReason: this.extractRejectionReason(t),
            components: t.components,
            rawMeta: t,
          },
        },
        upsert: true,
      },
    }));
    if (ops.length) await this.model.bulkWrite(ops);
    return this.findAll(whatsappAccountId);
  }

  private whatsappAccountIdQuery(id: string) {
    return whatsappAccountIdFilter(id);
  }

  private normalizeTemplateName(name: string) {
    const normalized = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');

    if (!normalized) throw new BadRequestException('Template name is required.');
    return normalized;
  }

  private buildTemplateComponents(dto: CreateTemplateDto) {
    const body = String(dto.body || '').trim();
    if (!body) throw new BadRequestException('Template body is required.');

    const components: any[] = [];
    const headerText = dto.headerText?.trim();
    const footerText = dto.footerText?.trim();

    if (headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    }

    const bodyComponent: any = { type: 'BODY', text: body };
    const placeholderCount = this.getBodyPlaceholderCount(body);
    if (placeholderCount > 0) {
      const examples = (dto.bodyExamples || []).map((value) => String(value || '').trim());
      if (examples.length < placeholderCount || examples.slice(0, placeholderCount).some((value) => !value)) {
        throw new BadRequestException(`Provide ${placeholderCount} body example value(s) for this template.`);
      }
      bodyComponent.example = { body_text: [examples.slice(0, placeholderCount)] };
    }
    components.push(bodyComponent);

    if (footerText) {
      components.push({ type: 'FOOTER', text: footerText });
    }

    const quickReplies = (dto.quickReplies || []).map((value) => String(value || '').trim()).filter(Boolean);
    if (quickReplies.length) {
      components.push({
        type: 'BUTTONS',
        buttons: quickReplies.map((text) => ({ type: 'QUICK_REPLY', text })),
      });
    }

    return components;
  }

  private buildLibraryTemplatePayload(name: string, dto: CreateTemplateDto) {
    const libraryTemplateName = dto.libraryTemplateName?.trim();
    if (!libraryTemplateName) throw new BadRequestException('Library template name is required.');

    const payload: Record<string, any> = {
      name,
      language: dto.language,
      category: dto.category,
      library_template_name: libraryTemplateName,
    };

    if (dto.libraryTemplateButtonInputs?.length) {
      payload.library_template_button_inputs = dto.libraryTemplateButtonInputs;
    }
    if (dto.libraryTemplateBodyInputs?.length) {
      payload.library_template_body_inputs = dto.libraryTemplateBodyInputs;
    }

    return payload;
  }

  private matchesLibraryFilters(template: any, filters: Record<string, any>) {
    const category = String(filters.category || '').trim().toUpperCase();
    const language = String(filters.language || '').trim().toLowerCase();
    const search = String(filters.name_or_content || filters.search || '').trim().toLowerCase();

    if (category && this.normalizeTemplateCategory(template) !== category) return false;
    if (language && !this.templateHasLanguage(template, language)) return false;
    if (search && !this.templateContainsSearch(template, search)) return false;

    return true;
  }

  private normalizeTemplateCategory(template: any) {
    return String(template?.category || template?.template_category || '').trim().toUpperCase();
  }

  private templateHasLanguage(template: any, requestedLanguage: string) {
    const requested = requestedLanguage.replace('-', '_');
    const requestedBase = requested.split('_')[0];
    const values = [
      template?.language,
      template?.language_code,
      template?.locale,
      ...(Array.isArray(template?.languages) ? template.languages : []),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase().replace('-', '_'));

    return values.some((value) => value === requested || value === requestedBase || value.split('_')[0] === requestedBase);
  }

  private templateContainsSearch(template: any, search: string) {
    const bodyText = template?.components?.find((component: any) => component?.type === 'BODY')?.text;
    const haystack = [
      template?.name,
      template?.library_template_name,
      template?.description,
      template?.body,
      bodyText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  }

  private getBodyPlaceholderCount(body: string) {
    const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    if (!matches.length) return 0;

    const max = Math.max(...matches);
    for (let i = 1; i <= max; i += 1) {
      if (!matches.includes(i)) {
        throw new BadRequestException('Body placeholders must be sequential, such as {{1}}, {{2}}.');
      }
    }
    return max;
  }

  private extractRejectionReason(template: any) {
    const candidates = [
      template?.rejectionReason,
      template?.rejected_reason,
      template?.rejectedReason,
      template?.review_rejection_reason,
      template?.quality_score?.reason,
      template?.rawMeta?.rejected_reason,
      template?.rawMeta?.response?.rejected_reason,
    ];

    return candidates
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find(Boolean) || '';
  }
}
