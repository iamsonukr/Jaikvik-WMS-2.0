import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatbotRule, ChatbotRuleDocument } from './chatbot-rule.schema';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

@Injectable()
export class ChatbotService {
  constructor(
    @InjectModel(ChatbotRule.name) private model: Model<ChatbotRuleDocument>,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(clientId: string) {
    return this.model.aggregate([
      { $match: this.clientIdQuery(clientId) },
      { $sort: { priority: 1 } },
    ]);
  }

  async create(dto: Omit<Partial<ChatbotRule>, 'clientId'> & { clientId: string }) {
    const client = await this.clients.findOne(dto.clientId);
    return this.model.create({
      ...dto,
      clientId: this.toObjectId(dto.clientId),
      tenantId: client?.tenantId,
    });
  }
  update(id: string, dto: Partial<ChatbotRule>) { return this.model.findByIdAndUpdate(id, dto, { new: true }); }
  remove(id: string) { return this.model.findByIdAndDelete(id); }

  async match(clientId: string, text: string): Promise<string | null> {
    const rules = await this.model.aggregate([
      { $match: { ...this.clientIdQuery(clientId), isActive: true } },
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

  private toObjectId(id: string) {
    if (!Types.ObjectId.isValid(String(id))) {
      throw new BadRequestException('A valid clientId is required.');
    }
    return new Types.ObjectId(String(id));
  }

  private clientIdQuery(id: string) {
    return {
      $or: [
        { clientId: this.toObjectId(id) },
        { $expr: { $eq: ['$clientId', String(id)] } },
      ],
    };
  }
}
