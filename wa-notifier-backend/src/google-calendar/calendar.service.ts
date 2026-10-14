import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import axios from 'axios';
import { CalendarConnection, CalendarDelivery, CalendarOAuthState, CalendarRecipient } from './calendar.schema';
import { CalendarGoogleService } from './calendar-google.service';
import { CalendarRecipientDto, CalendarSettingsDto } from './calendar.dto';
import { TemplatesService } from '../templates/templates.service';
import { InboxService } from '../inbox/inbox.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { Contact } from '../contacts/contact.schema';
import { Tenant } from '../tenants/tenant.schema';
import { hash, phoneNumber } from '../google-sheets/sheets.utils';
import { templateParameterCount } from '../zapier/zapier.utils';
import { whatsappAccountIdFilter } from '../common/mongo-id';

export const calendarDefaults = { calendarId: 'primary', enabled: false, reminderMinutes: 60, templateName: '', parameters: [] };
export function reminderDue(event: any, minutes: number, now = Date.now()) {
  const start = Date.parse(event.start?.dateTime);
  return event.status !== 'cancelled' && Number.isFinite(start) && start > now && start - minutes * 60000 <= now;
}
@Injectable()
export class CalendarService implements OnModuleInit {
  private working = false;
  private logger = new Logger(CalendarService.name);
  constructor(
    @InjectModel(CalendarConnection.name) private connections: Model<CalendarConnection>,
    @InjectModel(CalendarRecipient.name) private recipients: Model<CalendarRecipient>,
    @InjectModel(CalendarDelivery.name) private deliveries: Model<CalendarDelivery>,
    @InjectModel(CalendarOAuthState.name) private states: Model<CalendarOAuthState>,
    @InjectModel(Contact.name) private contacts: Model<Contact>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    private google: CalendarGoogleService, private templates: TemplatesService,
    private inbox: InboxService, private accounts: WhatsAppAccountsService,
  ) {}
  async onModuleInit() { await Promise.all([this.connections.init(), this.recipients.init(), this.deliveries.init(), this.states.init()]); }
  private async request(token: string, path: string, params?: any, missingIsCanceled = false) {
    try { return (await axios.get(`https://www.googleapis.com/calendar/v3/${path}`, {
      params, headers: { Authorization: `Bearer ${token}` }, timeout: 20000, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024,
    })).data; } catch (error) {
      if (missingIsCanceled && [404, 410].includes(error?.response?.status)) return { status: 'cancelled' };
      throw new BadRequestException('Cannot read Google Calendar. Check access and enable the Calendar API.');
    }
  }
  async status(id: string) {
    const connection = await this.connections.findOne({ whatsappAccountId: id }).lean();
    const templates = (await this.templates.findAll(id)).flatMap(t => {
      try { return [{ name: t.name, count: templateParameterCount(t) }]; } catch { return []; }
    });
    return { configured: this.google.configured(), connected: !!connection?.connected,
      settings: { ...calendarDefaults, ...connection?.settings }, lastError: connection?.lastError,
      lastSyncAt: connection?.lastSyncAt, templates,
      deliveries: await this.deliveries.find({ whatsappAccountId: id }).sort({ createdAt: -1 }).limit(30).lean() };
  }
  async calendars(id: string) {
    const token = await this.google.accessToken(id);
    const items = []; let pageToken: string;
    do {
      const data = await this.request(token, 'users/me/calendarList', { maxResults: 250, pageToken });
      items.push(...(data.items || []).map(c => ({ id: c.id, name: c.summary, timezone: c.timeZone })));
      pageToken = data.nextPageToken;
      if (items.length > 2000) throw new BadRequestException('Too many calendars.');
    } while (pageToken);
    return items;
  }
  async events(id: string, calendarId: string) {
    if (!calendarId || calendarId.length > 1024) throw new BadRequestException('Choose a calendar.');
    const token = await this.google.accessToken(id);
    const items = []; let pageToken: string;
    do {
      const data = await this.request(token, `calendars/${encodeURIComponent(calendarId)}/events`, {
        singleEvents: true, orderBy: 'startTime', timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 8 * 86400000).toISOString(), maxResults: 250, pageToken,
      });
      items.push(...(data.items || []).filter(e => e.start?.dateTime && e.status !== 'cancelled')
        .map(e => ({ id: e.id, name: e.summary || 'Appointment', start: e.start, location: e.location || '', url: e.htmlLink })));
      pageToken = data.nextPageToken;
      if (items.length > 2000) throw new BadRequestException('Too many appointments. Choose a smaller calendar.');
    } while (pageToken);
    const mappings = await this.recipients.find({ whatsappAccountId: id, calendarId }).lean();
    return items.map(e => ({ ...e, recipient: mappings.find(m => m.eventId === e.id) || null }));
  }
  async save(id: string, settings: CalendarSettingsDto) {
    if (settings.enabled) {
      const template = await this.templates.findByName(id, settings.templateName);
      if (templateParameterCount(template) !== settings.parameters.length) throw new BadRequestException('Map every template parameter.');
    }
    await this.events(id, settings.calendarId);
    const saved = await this.connections.updateOne({ whatsappAccountId: id, connected: true }, { settings, $inc: { revision: 1 } });
    if (!saved.matchedCount) throw new BadRequestException('Connect Google Calendar first.');
    return { saved: true };
  }
  async recipient(id: string, dto: CalendarRecipientDto) {
    const phone = phoneNumber(dto.phone);
    if (!phone) throw new BadRequestException('Enter a phone number including country code.');
    const token = await this.google.accessToken(id);
    const event = await this.request(token, `calendars/${encodeURIComponent(dto.calendarId)}/events/${encodeURIComponent(dto.eventId)}`);
    if (!event.start?.dateTime || event.status === 'cancelled') throw new BadRequestException('Choose an active timed appointment.');
    await this.recipients.updateOne({ whatsappAccountId: id, calendarId: dto.calendarId, eventId: dto.eventId },
      { $set: { phone, name: dto.name, consent: dto.consent } }, { upsert: true });
    return { saved: true };
  }
  @Cron('0 * * * * *')
  async work() {
    if (this.working) return;
    this.working = true;
    try {
      await this.deliveries.updateMany({ status: 'sending', updatedAt: { $lt: new Date(Date.now() - 300000) } },
        { status: 'needs_review', error: 'Interrupted send. Check Inbox and wallet before sending manually.' });
      for (const connection of await this.connections.find({ connected: true, 'settings.enabled': true })) {
        const id = String(connection.whatsappAccountId);
        try {
          const account = await this.accounts.findOne(id);
          if (!account?.isActive || account.isRemoved || !await this.tenants.exists({ _id: account.tenantId, status: 'active' })) continue;
          const settings = connection.settings;
          const token = await this.google.accessToken(id);
          let eventFailures = 0;
          for (const mapping of await this.recipients.find({ whatsappAccountId: id, calendarId: settings.calendarId, consent: true })) {
            let event;
            try { event = await this.request(token, `calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(mapping.eventId)}`, undefined, true); }
            catch { eventFailures++; continue; }
            if (!reminderDue(event, settings.reminderMinutes)) continue;
            const contact = await this.contacts.findOne({ ...whatsappAccountIdFilter(id), phone: mapping.phone });
            if (contact && (!contact.isActive || contact.isOptedOut)) continue;
            const template = await this.templates.findByName(id, settings.templateName);
            if (templateParameterCount(template) !== settings.parameters.length) continue;
            const timezone = event.start.timeZone || 'UTC';
            const fields = { name: mapping.name || contact?.name || '', event_name: event.summary || 'Appointment',
              start_time: new Date(event.start.dateTime).toLocaleString('en-GB', { timeZone: timezone }), timezone, location: event.location || '' };
            const parameters = settings.parameters.map(field => fields[field]);
            if (parameters.some(v => typeof v !== 'string' || !v.trim() || v.length > 2000)) continue;
            if (!await this.connections.exists({ _id: connection._id, connected: true, revision: connection.revision, 'settings.enabled': true })
              || !await this.recipients.exists({ _id: mapping._id, phone: mapping.phone, consent: true })) continue;
            // Durable unique claim before sending: uncertain paid sends never retry automatically.
            const key = hash(`${id}|${settings.calendarId}|${event.id}|${event.start.dateTime}`);
            let delivery;
            try { delivery = await this.deliveries.create({ whatsappAccountId: connection.whatsappAccountId, key, eventName: event.summary, status: 'sending' }); }
            catch (error) { if (error?.code === 11000) continue; throw error; }
            try {
              const message = await this.inbox.sendTemplate(id, mapping.phone, template.name, template.language, parameters);
              await this.deliveries.updateOne({ _id: delivery._id }, { status: 'sent', messageId: String(message._id) });
            } catch {
              await this.deliveries.updateOne({ _id: delivery._id }, { status: 'needs_review', error: 'Send uncertain. Check Inbox and wallet; no automatic retry.' });
            }
          }
          await this.connections.updateOne({ _id: connection._id }, { lastSyncAt: new Date(),
            lastError: eventFailures ? 'Some appointments could not be read. Check calendar access and try again.' : '' });
        } catch { await this.connections.updateOne({ _id: connection._id }, { lastError: 'Calendar reminders could not run. Check connection and settings.' }); }
      }
    } catch { this.logger.warn('Google Calendar worker interrupted.'); }
    finally { this.working = false; }
  }
}
