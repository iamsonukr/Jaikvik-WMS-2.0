import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Broadcast, BroadcastDocument } from '../broadcasts/broadcast.schema';
import { Message, MessageDocument } from '../inbox/message.schema';
import { Contact, ContactDocument } from '../contacts/contact.schema';
import { AccountAlert, AccountAlertDocument } from '../webhooks/account-alert.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Broadcast.name) private broadcastModel: Model<BroadcastDocument>,
    @InjectModel(Message.name)   private messageModel: Model<MessageDocument>,
    @InjectModel(Contact.name)   private contactModel: Model<ContactDocument>,
    @InjectModel(AccountAlert.name) private alertModel: Model<AccountAlertDocument>,
  ) {}

  async overview(clientId: string) {
    const clientFilter = this.clientIdQuery(clientId);
    const [totalContacts, broadcastStats] = await Promise.all([
      this.contactModel.collection.countDocuments({ ...clientFilter, isActive: true }),
      this.broadcastModel.aggregate([
        { $match: clientFilter },
        {
          $group: {
            _id: null,
            totalBroadcasts: { $sum: 1 },
            totalSent: { $sum: { $ifNull: ['$sentCount', 0] } },
            totalDelivered: { $sum: { $ifNull: ['$deliveredCount', 0] } },
            totalRead: { $sum: { $ifNull: ['$readCount', 0] } },
            totalFailed: { $sum: { $ifNull: ['$failedCount', 0] } },
          },
        },
      ]),
    ]);

    const stats = broadcastStats[0] || {};

    return {
      totalContacts,
      totalBroadcasts: stats.totalBroadcasts || 0,
      totalSent: stats.totalSent || 0,
      totalDelivered: stats.totalDelivered || 0,
      totalRead: stats.totalRead || 0,
      totalFailed: stats.totalFailed || 0,
    };
  }

  async dailyStats(clientId: string, days = 30) {
    const clientFilter = this.clientIdQuery(clientId);
    const from = new Date();
    from.setDate(from.getDate() - days);

    return this.broadcastModel.aggregate([
      { $match: { ...clientFilter, createdAt: { $gte: from } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        sent:      { $sum: '$sentCount' },
        delivered: { $sum: '$deliveredCount' },
        read:      { $sum: '$readCount' },
        failed:    { $sum: '$failedCount' },
      }},
      { $sort: { _id: 1 } },
    ]);
  }

  async inboxStats(clientId: string) {
    const clientFilter = this.clientIdQuery(clientId);
    const [inbound, outbound, open] = await Promise.all([
      this.messageModel.collection.countDocuments({ ...clientFilter, direction: 'inbound' }),
      this.messageModel.collection.countDocuments({ ...clientFilter, direction: 'outbound' }),
      this.messageModel.collection.countDocuments({ ...clientFilter, direction: 'inbound', threadStatus: 'open' }),
    ]);
    return { inbound, outbound, openThreads: open };
  }

  alerts(clientId: string) {
    return this.alertModel
      .collection.find({ $or: [this.clientIdQuery(clientId), { clientId: { $exists: false } }, { clientId: null }] })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
  }

  private clientIdQuery(clientId: string) {
    if (!Types.ObjectId.isValid(String(clientId))) {
      throw new BadRequestException('A valid clientId is required.');
    }
    return {
      $or: [
        { clientId: new Types.ObjectId(clientId) },
        { $expr: { $eq: ['$clientId', String(clientId)] } },
      ],
    };
  }
}
