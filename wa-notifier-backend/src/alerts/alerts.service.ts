import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { Wallet, WalletDocument } from '../wallet/wallet.schema';
import { Subscription, SubscriptionDocument } from '../subscriptions/subscription.schema';
import { RazorpayPayment, RazorpayPaymentDocument } from '../payments/razorpay-payment.schema';
import { Template, TemplateDocument } from '../templates/template.schema';
import { Broadcast, BroadcastDocument } from '../broadcasts/broadcast.schema';
import { AccountAlert, AccountAlertDocument } from '../webhooks/account-alert.schema';
import { toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';

type AlertSeverity = 'critical' | 'warning' | 'info';

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  priority: number;
  source: string;
  actionHref?: string;
  createdAt?: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class AlertsService {
  constructor(
    private whatsappAccounts: WhatsAppAccountsService,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(RazorpayPayment.name) private paymentModel: Model<RazorpayPaymentDocument>,
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
    @InjectModel(Broadcast.name) private broadcastModel: Model<BroadcastDocument>,
    @InjectModel(AccountAlert.name) private accountAlertModel: Model<AccountAlertDocument>,
  ) {}

  async list(whatsappAccountId: string) {
    const account = await this.whatsappAccounts.findOne(whatsappAccountId);
    if (!account) throw new NotFoundException('WhatsApp account not found');

    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const tenantId = account.tenantId ? toObjectId(account.tenantId, 'tenantId') : null;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [wallet, subscriptions, failedPayments, rejectedTemplates, failedBroadcasts, accountAlerts] = await Promise.all([
      tenantId ? this.walletModel.findOne({ tenantId }) : null,
      tenantId ? this.subscriptionModel.find({ tenantId }).sort({ endDate: -1 }).limit(5) : [],
      tenantId ? this.paymentModel.find({ tenantId, status: 'failed', createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(5) : [],
      this.templateModel.find({ ...whatsappAccountIdFilter(whatsappAccountId), status: { $regex: /^rejected$/i } }).sort({ updatedAt: -1 }).limit(8),
      this.broadcastModel.find({
        ...whatsappAccountIdFilter(whatsappAccountId),
        $or: [{ status: 'failed' }, { failedCount: { $gt: 0 } }],
        updatedAt: { $gte: since },
      }).sort({ updatedAt: -1 }).limit(8),
      this.accountAlertModel.find({
        $or: [
          { whatsappAccountId: accountObjectId },
          ...(tenantId ? [{ tenantId }] : []),
          { whatsappAccountId: { $exists: false } },
          { whatsappAccountId: null },
        ],
      }).sort({ createdAt: -1 }).limit(10),
    ]);

    const alerts: AlertItem[] = [
      ...this.walletAlerts(wallet),
      ...this.subscriptionAlerts(subscriptions),
      ...this.paymentAlerts(failedPayments),
      ...this.whatsappAccountAlerts(account),
      ...this.templateAlerts(rejectedTemplates),
      ...this.broadcastAlerts(failedBroadcasts),
      ...this.metaAccountAlerts(accountAlerts),
    ];

    return alerts
      .sort((a, b) => b.priority - a.priority || Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)))
      .slice(0, 50);
  }

  private walletAlerts(wallet: WalletDocument | null): AlertItem[] {
    const balance = Number(wallet?.balance || 0);
    if (!wallet) {
      return [this.alert('wallet_missing', 'critical', 100, 'Wallet not initialized', 'Wallet balance is not available for this client.', 'wallet', '/client/wallet')];
    }
    if (balance <= 0) {
      return [this.alert('wallet_empty', 'critical', 100, 'Wallet balance empty', 'Recharge wallet before sending campaigns or replies.', 'wallet', '/client/wallet', this.dateOf(wallet, 'updatedAt'), { balance })];
    }
    if (balance < 500) {
      return [this.alert('wallet_low', 'warning', 90, 'Low wallet balance', `Wallet balance is INR ${balance}. Recharge soon to avoid failed sends.`, 'wallet', '/client/wallet', this.dateOf(wallet, 'updatedAt'), { balance })];
    }
    return [];
  }

  private subscriptionAlerts(subscriptions: SubscriptionDocument[]): AlertItem[] {
    const active = subscriptions.find((sub) => sub.status === 'active');
    if (!active) {
      const latest = subscriptions[0];
      return [this.alert('subscription_missing', 'critical', 95, 'No active subscription', 'Choose or renew a plan to keep messaging features active.', 'subscription', '/client/plans', this.dateOf(latest, 'updatedAt'))];
    }

    const daysLeft = Math.ceil((new Date(active.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysLeft < 0) {
      return [this.alert('subscription_expired', 'critical', 98, 'Subscription expired', 'Renew your subscription to continue using paid messaging features.', 'subscription', '/client/plans', active.endDate, { endDate: active.endDate })];
    }
    if (daysLeft <= 7) {
      return [this.alert('subscription_expiring', 'critical', 92, 'Subscription expiring soon', `Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`, 'subscription', '/client/plans', active.endDate, { endDate: active.endDate })];
    }
    if (daysLeft <= 15) {
      return [this.alert('subscription_expiring_notice', 'warning', 72, 'Subscription renewal approaching', `Your subscription expires in ${daysLeft} days.`, 'subscription', '/client/plans', active.endDate, { endDate: active.endDate })];
    }
    return [];
  }

  private paymentAlerts(payments: RazorpayPaymentDocument[]): AlertItem[] {
    return payments.map((payment) => this.alert(
      `payment_failed_${payment._id}`,
      'critical',
      88,
      'Payment failed',
      `A ${payment.purpose.replace(/_/g, ' ')} payment of INR ${payment.amount} failed.`,
      'payment',
      '/client/payments',
      this.dateOf(payment, 'updatedAt'),
      { paymentId: payment._id, orderId: payment.razorpayOrderId },
    ));
  }

  private whatsappAccountAlerts(account: any): AlertItem[] {
    const alerts: AlertItem[] = [];
    if (!account.isActive) {
      alerts.push(this.alert('whatsapp_inactive', 'critical', 96, 'WhatsApp account disabled', 'This WhatsApp account is inactive and cannot send or receive messages.', 'whatsapp', '/client/connect-whatsapp', account.updatedAt));
    }
    if (!account.accessToken) {
      alerts.push(this.alert('whatsapp_token_missing', 'critical', 94, 'Access token missing', 'Add a permanent access token for this WhatsApp account.', 'whatsapp', '/client/connect-whatsapp', account.updatedAt));
    }
    if (!account.wabaId || !account.phoneNumberId) {
      alerts.push(this.alert('whatsapp_setup_incomplete', 'critical', 93, 'WhatsApp setup incomplete', 'WABA ID or phone number ID is missing for this account.', 'whatsapp', '/client/connect-whatsapp', account.updatedAt));
    }
    return alerts;
  }

  private templateAlerts(templates: TemplateDocument[]): AlertItem[] {
    return templates.map((template) => this.alert(
      `template_rejected_${template._id}`,
      'warning',
      78,
      'Template rejected',
      `${template.name} was rejected${template.rejectionReason ? `: ${template.rejectionReason}` : '.'}`,
      'template',
      '/client/templates',
      this.dateOf(template, 'updatedAt'),
      { templateId: template._id, name: template.name },
    ));
  }

  private broadcastAlerts(broadcasts: BroadcastDocument[]): AlertItem[] {
    return broadcasts.map((broadcast) => {
      const failedCount = Number(broadcast.failedCount || 0);
      const totalCount = Number(broadcast.totalCount || 0);
      const highFailureRate = totalCount > 0 && failedCount / totalCount >= 0.1;
      return this.alert(
        `broadcast_failed_${broadcast._id}`,
        broadcast.status === 'failed' || highFailureRate ? 'critical' : 'warning',
        broadcast.status === 'failed' ? 86 : highFailureRate ? 82 : 68,
        broadcast.status === 'failed' ? 'Broadcast failed' : 'Broadcast delivery failures',
        `${broadcast.name} has ${failedCount} failed recipient${failedCount === 1 ? '' : 's'}${totalCount ? ` out of ${totalCount}` : ''}.`,
        'broadcast',
        `/client/broadcasts/${broadcast._id}`,
        this.dateOf(broadcast, 'updatedAt'),
        { broadcastId: broadcast._id, failedCount, totalCount },
      );
    });
  }

  private metaAccountAlerts(accountAlerts: AccountAlertDocument[]): AlertItem[] {
    return accountAlerts.map((item) => {
      const type = String(item.type || item.field || 'account_alert').toLowerCase();
      const tokenIssue = /token|permission|auth|access/.test(type + ' ' + item.description);
      const webhookIssue = /webhook|callback|notification|subscribe/.test(type + ' ' + item.description);
      return this.alert(
        `meta_${item._id}`,
        this.metaSeverity(item.severity),
        tokenIssue ? 91 : webhookIssue ? 84 : 70,
        tokenIssue ? 'WhatsApp token issue' : webhookIssue ? 'WhatsApp webhook issue' : item.type || 'WhatsApp account alert',
        item.description || 'Meta sent an account alert for this WhatsApp account.',
        'meta',
        '/client/settings',
        this.dateOf(item, 'createdAt'),
        { entityType: item.entityType, entityId: item.entityId, status: item.status },
      );
    });
  }

  private metaSeverity(severity?: string): AlertSeverity {
    const value = String(severity || '').toLowerCase();
    if (['critical', 'error', 'high'].includes(value)) return 'critical';
    if (['warning', 'medium'].includes(value)) return 'warning';
    return 'info';
  }

  private dateOf(doc: any, key: 'createdAt' | 'updatedAt') {
    return doc?.[key] ? new Date(doc[key]) : undefined;
  }

  private alert(
    id: string,
    severity: AlertSeverity,
    priority: number,
    title: string,
    message: string,
    source: string,
    actionHref?: string,
    createdAt?: Date,
    metadata?: Record<string, any>,
  ): AlertItem {
    return { id, type: id.replace(/_.+$/, ''), severity, priority, title, message, source, actionHref, createdAt, metadata };
  }
}
