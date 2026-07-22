import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './message.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(Message.name) private model: Model<MessageDocument>,
    private meta: MetaService,
    private clients: WhatsAppAccountsService,
  ) {}

  /** All unique threads (latest message per phone) */
  async threads(clientId: string) {
    return this.model.aggregate([
      { $match: { clientId: this.clientIdQuery(clientId) } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$phone', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } },
      { $sort: { createdAt: -1 } },
    ]);
  }

  messages(clientId: string, phone: string) {
    return this.model
      .find({ clientId: this.clientIdQuery(clientId), phone })
      .sort({ createdAt: 1 })
      .limit(200);
  }

  save(dto: Partial<Message>) { return this.model.create(dto); }

  async reply(clientId: string, phone: string, text: string) {
    const client = await this.clients.findOne(clientId);
    const res = await this.meta.sendText(client.phoneNumberId, client.accessToken, phone, text);
    return this.model.create({
      clientId: new Types.ObjectId(clientId),
      tenantId: client?.tenantId,
      phone,
      direction: 'outbound',
      type: 'text',
      text,
      waMessageId: res?.messages?.[0]?.id,
      timestamp: new Date(),
    });
  }

  assign(id: string, userId: string) {
    return this.model.findByIdAndUpdate(id, { assignedTo: new Types.ObjectId(userId), threadStatus: 'assigned' }, { new: true });
  }

  resolve(clientId: string, phone: string) {
    return this.model.updateMany({ clientId: this.clientIdQuery(clientId), phone }, { threadStatus: 'resolved' });
  }

  private clientIdQuery(clientId: string) {
    return { $in: [new Types.ObjectId(clientId), String(clientId)] };
  }
}
