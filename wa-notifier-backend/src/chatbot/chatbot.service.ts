import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatbotRule, ChatbotRuleDocument } from './chatbot-rule.schema';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { resolveWhatsAppAccountId, toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class ChatbotService {
  constructor(
    @InjectModel(ChatbotRule.name) private model: Model<ChatbotRuleDocument>,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(whatsappAccountId: string) {
    return this.model.aggregate([
      { $match: this.whatsappAccountIdQuery(whatsappAccountId) },
      { $sort: { priority: 1 } },
    ]);
  }

  async create(dto: Omit<Partial<ChatbotRule>, 'whatsappAccountId'> & { whatsappAccountId?: string; clientId?: string }) {
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    return this.model.create({
      ...dto,
      whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
      tenantId: account?.tenantId,
    });
  }
  update(id: string, dto: Partial<ChatbotRule>) { return this.model.findByIdAndUpdate(id, dto, { new: true }); }
  remove(id: string) { return this.model.findByIdAndDelete(id); }

  async match(whatsappAccountId: string, text: string): Promise<string | null> {
    const rules = await this.model.aggregate([
      { $match: { ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true } },
      { $sort: { priority: 1 } },
    ]);
    const lower = text.toLowerCase();
    for (const rule of rules) {
      const kw = rule.keyword.toLowerCase();
      const hit =
        rule.matchType === 'exact'       ? lower === kw :
        rule.matchType === 'starts_with' ? lower.startsWith(kw) :
        lower.includes(kw);
      if (hit) return rule.replyText;
    }
    return null;
  }

  private whatsappAccountIdQuery(id: string) {
    return whatsappAccountIdFilter(id);
  }
}
