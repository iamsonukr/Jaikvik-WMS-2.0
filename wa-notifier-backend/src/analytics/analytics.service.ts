import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Broadcast, BroadcastDocument } from '../broadcasts/broadcast.schema';
import { Message, MessageDocument } from '../inbox/message.schema';
import { Contact, ContactDocument } from '../contacts/contact.schema';
import { AccountAlert, AccountAlertDocument } from '../webhooks/account-alert.schema';
import { whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Broadcast.name) private broadcastModel: Model<BroadcastDocument>,
    @InjectModel(Message.name)   private messageModel: Model<MessageDocument>,
    @InjectModel(Contact.name)   private contactModel: Model<ContactDocument>,
    @InjectModel(AccountAlert.name) private alertModel: Model<AccountAlertDocument>,
  ) {}

  async overview(whatsappAccountId: string) {
    const accountFilter = this.whatsappAccountIdQuery(whatsappAccountId);
    const [totalContacts, broadcastStats] = await Promise.all([
      this.contactModel.collection.countDocuments({ ...accountFilter, isActive: true }),
      this.broadcastModel.aggregate([
        { $match: accountFilter },
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

  async dailyStats(whatsappAccountId: string, days = 30) {
    const accountFilter = this.whatsappAccountIdQuery(whatsappAccountId);
    const from = new Date();
    from.setDate(from.getDate() - days);

    return this.broadcastModel.aggregate([
      { $match: { ...accountFilter, createdAt: { $gte: from } } },
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

  async inboxStats(whatsappAccountId: string) {
    const accountFilter = this.whatsappAccountIdQuery(whatsappAccountId);
    const [inbound, outbound, open] = await Promise.all([
      this.messageModel.collection.countDocuments({ ...accountFilter, direction: 'inbound' }),
      this.messageModel.collection.countDocuments({ ...accountFilter, direction: 'outbound' }),
      this.messageModel.collection.countDocuments({ ...accountFilter, direction: 'inbound', threadStatus: 'open' }),
    ]);
    return { inbound, outbound, openThreads: open };
  }

  alerts(whatsappAccountId: string) {
    return this.alertModel
      .collection.find({ $or: [this.whatsappAccountIdQuery(whatsappAccountId), { whatsappAccountId: { $exists: false } }, { whatsappAccountId: null }] })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
  }

  private whatsappAccountIdQuery(whatsappAccountId: string) {
    return whatsappAccountIdFilter(whatsappAccountId);
  }
}
