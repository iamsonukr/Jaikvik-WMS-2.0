import { Body, Controller, Get, Post, Query, Logger, Res, Req, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboxService } from '../inbox/inbox.service';
import { BroadcastsService } from '../broadcasts/broadcasts.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MetaService } from '../common/meta.service';
import { Public } from '../common/decorators/public.decorator';
import { AccountAlert, AccountAlertDocument } from './account-alert.schema';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private cfg: ConfigService,
    private inbox: InboxService,
    private broadcasts: BroadcastsService,
    private clients: WhatsAppAccountsService,
    private chatbot: ChatbotService,
    private meta: MetaService,
    @InjectModel(AccountAlert.name) private alerts: Model<AccountAlertDocument>,
  ) {}

  /** Meta verification handshake — must return RAW plain text of hub.challenge */
  @Public()
  @Get('meta')
  verify(@Query() q: any, @Res() res: Response) {
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === this.cfg.get('META_VERIFY_TOKEN')) {
      return res.status(200).send(q['hub.challenge']);
    }
    return res.status(403).send('Forbidden');
  }

  /**
   * Inbound events from Meta. Verifies X-Hub-Signature-256 against the raw
   * request body before processing anything — without this, anyone who
   * finds this URL could POST fabricated "incoming message"/"account alert"
   * events (this endpoint has no other auth, since Meta itself can't send
   * a bearer token). Uses req.rawBody (enabled app-wide in main.ts) rather
   * than re-serializing the parsed body, since JSON.stringify can produce
   * different bytes than what was actually signed.
   */
  @Public()
  @Post('meta')
  async receive(@Req() req: any, @Body() body: any) {
    const appSecret = this.cfg.get('META_APP_SECRET');
    if (appSecret) {
      const signatureHeader = req.headers['x-hub-signature-256'];
      if (!signatureHeader || !req.rawBody) {
        throw new UnauthorizedException('Missing webhook signature');
      }
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
      const expectedBuf = Buffer.from(expected);
      const receivedBuf = Buffer.from(signatureHeader);
      if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else {
      this.logger.warn('META_APP_SECRET is not set — Meta webhook signature is NOT being verified.');
    }

    try {
      const entries = body?.entry || [];
      this.logger.log(`Meta webhook received ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const val = change.value;
          if (!val) continue;

          if (change.field === 'account_alerts') {
            await this.saveAccountAlert(change.field, val).catch(err => {
              this.logger.warn(`Account alert webhook skipped: ${err?.message || err}`);
            });
            continue;
          }

          // ── Status updates (delivery receipts) ──
          for (const status of val.statuses || []) {
            this.logger.log(`Meta status update ${status.id}: ${status.status}`);
            await this.broadcasts.handleStatusUpdate(status.id, status.status).catch(() => null);
          }

          // ── Inbound messages ──
          for (const msg of val.messages || []) {
            const phoneNumberId = val?.metadata?.phone_number_id;
            if (!phoneNumberId) {
              this.logger.warn(`Inbound Meta message ${msg.id} skipped: missing phone_number_id`);
              continue;
            }

            // Find client by phoneNumberId
            const client = await this.findClientByPhoneNumberId(phoneNumberId);
            if (!client) {
              this.logger.warn(`Inbound Meta message ${msg.id} skipped: no client found for phone_number_id ${phoneNumberId}`);
              continue;
            }

            const contact = val.contacts?.[0];
            const msgRecord = await this.inbox.save({
              clientId: client._id,
              tenantId: client.tenantId,
              phone: msg.from,
              contactName: contact?.profile?.name,
              direction: 'inbound',
              type: msg.type,
              text: msg.text?.body,
              media: msg.image || msg.audio || msg.video || msg.document,
              waMessageId: msg.id,
              timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
              threadStatus: 'open',
            });
            this.logger.log(`Saved inbound message ${msg.id} for client ${client._id} from ${msg.from}`);

            // Mark read
            await this.meta.markRead(phoneNumberId, client.accessToken, msg.id).catch(() => null);

            // Chatbot auto-reply on text
            if (msg.type === 'text' && msg.text?.body) {
              const reply = await this.chatbot.match(String(client._id), msg.text.body);
              if (reply) {
                await this.inbox.reply(String(client._id), msg.from, reply).catch(() => null);
              }
            }
          }
        }
      }
    } catch (err) {
      this.logger.error('Webhook processing error', err);
    }
    return { status: 'ok' };
  }  

  // Simple in-memory cache — avoids a DB hit on every message
  private _clientCache: Map<string, any> = new Map();

  private async findClientByPhoneNumberId(phoneNumberId: string) {
    if (this._clientCache.has(phoneNumberId)) {
      const cached = this._clientCache.get(phoneNumberId);
      if (cached) return cached;
      this._clientCache.delete(phoneNumberId);
    }
    const client = await this.clients.findByPhoneNumberId(phoneNumberId);
    if (client) this._clientCache.set(phoneNumberId, client);
    return client;
  }

  private async saveAccountAlert(field: string, val: any) {
    const entityId = val?.entity_id == null ? '' : String(val.entity_id);
    const client = entityId ? await this.clients.findByMetaEntityId(entityId) : null;

    await this.alerts.create({
      clientId: client?._id,
      tenantId: client?.tenantId,
      field,
      entityType: val?.entity_type,
      entityId,
      severity: val?.alert_severity,
      status: val?.alert_status,
      type: val?.alert_type,
      description: val?.alert_description,
      raw: val,
    });

    this.logger.log(`Saved account alert ${val?.alert_type || 'unknown'} for ${entityId || 'unknown entity'}`);
  }
}
