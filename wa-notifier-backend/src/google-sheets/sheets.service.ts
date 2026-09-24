import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { SheetsConnection, SheetsEvent } from './sheets.schema';
import { SheetsGoogleService } from './sheets-google.service';
import { SheetSelectionDto, SheetSettingsDto } from './sheets.dto';
import { columnName, consentGiven, dueTime, hash, phoneNumber, readTable, tabRange } from './sheets.utils';
import { Contact } from '../contacts/contact.schema';
import { ContactsService } from '../contacts/contacts.service';
import { InboxService } from '../inbox/inbox.service';
import { Message } from '../inbox/message.schema';
import { BroadcastLog } from '../broadcasts/broadcast.schema';
import { TemplatesService } from '../templates/templates.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { Tenant } from '../tenants/tenant.schema';
import { whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class SheetsService implements OnModuleInit {
  constructor(
    @InjectModel(SheetsConnection.name) private connections: Model<SheetsConnection>,
    @InjectModel(SheetsEvent.name) private events: Model<SheetsEvent>,
    @InjectModel(Contact.name) private contactModel: Model<Contact>,
    @InjectModel(Message.name) private messages: Model<Message>,
    @InjectModel(BroadcastLog.name) private logs: Model<BroadcastLog>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    private google: SheetsGoogleService, private contacts: ContactsService, private inbox: InboxService,
    private templates: TemplatesService, private accounts: WhatsAppAccountsService,
  ) {}

  async onModuleInit() {
    // Sending depends on these unique indexes, not only process-local checks.
    await Promise.all([this.connections.init(), this.events.init()]);
  }

  async status(accountId: string) {
    const connection = await this.connections.findOne({ whatsappAccountId: accountId }).lean();
    const events = await this.events.find({ whatsappAccountId: accountId }).sort({ createdAt: -1 }).limit(50).lean();
    return { configured: this.google.configured(), connected: connection?.connected || false,
      settings: connection?.settings || null, lastSyncAt: connection?.lastSyncAt, lastError: connection?.lastError,
      lastResult: connection?.lastResult, busy: connection?.lockedUntil > new Date(), events };
  }
  async inspect(accountId: string, spreadsheetId: string) {
    if (!/^[\w-]{10,200}$/.test(spreadsheetId || '')) throw new BadRequestException('Enter a valid spreadsheet ID or URL.');
    const token = await this.google.accessToken(accountId);
    const data = await this.google.request(token, 'GET', spreadsheetId, '?fields=spreadsheetId,properties(title),sheets(properties)');
    return { spreadsheetId, title: data.properties.title, sheets: data.sheets.map(s => s.properties) };
  }
  private async table(token: string, selection: SheetSelectionDto) {
    const book = await this.google.request(token, 'GET', selection.spreadsheetId, '?fields=sheets(properties)');
    const sheet = book.sheets.find(s => s.properties.sheetId === selection.sheetId)?.properties;
    if (!sheet || sheet.sheetType !== 'GRID') throw new BadRequestException('Choose an existing grid tab.');
    // Read the used range, including rows after any blank gap, so oversized
    // sheets cannot silently import only a prefix. HTTP response size is capped.
    const range = tabRange(sheet.title, '').slice(0, -1);
    const data = await this.google.request(token, 'GET', selection.spreadsheetId, `/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
    return { ...readTable(data.values || []), title: sheet.title, gridRows: sheet.gridProperties.rowCount };
  }
  async preview(accountId: string, selection: SheetSelectionDto) {
    const table = await this.table(await this.google.accessToken(accountId), selection);
    return { headers: table.headers, rows: table.rows.slice(0, 10), totalRows: table.rows.length, title: table.title };
  }
  private validateColumns(settings: SheetSettingsDto, headers: string[]) {
    const required = [settings.phoneColumn, settings.nameColumn, settings.tagsColumn,
      ...Object.values(settings.customFields), ...settings.parameterColumns];
    if (settings.automation !== 'off') required.push(settings.consentColumn, settings.statusColumn);
    if (settings.automation === 'due_date') required.push(settings.dueColumn);
    if (!settings.phoneColumn || required.filter(Boolean).some(column => typeof column !== 'string' || !headers.includes(column))) {
      throw new BadRequestException('A mapped column is missing from the sheet. Reload columns and update the mapping.');
    }
    if (settings.automation !== 'off' && (!settings.consentColumn || !settings.statusColumn || !settings.templateName)) {
      throw new BadRequestException('Automation needs a consent column, a dedicated status column, and an approved template.');
    }
    if (settings.automation === 'due_date' && !settings.dueColumn) throw new BadRequestException('Choose a reminder date column.');
    const inputs = [settings.phoneColumn, settings.nameColumn, settings.tagsColumn, settings.consentColumn, settings.dueColumn,
      ...Object.values(settings.customFields), ...settings.parameterColumns].filter(Boolean);
    if (settings.statusColumn && inputs.includes(settings.statusColumn)) throw new BadRequestException('The WMS status column must be separate from all input columns.');
    if (Object.keys(settings.customFields).length > 30 || Object.keys(settings.customFields).some(k => !/^[a-zA-Z0-9_]+$/.test(k) || ['__proto__', 'prototype', 'constructor'].includes(k))
      || Object.values(settings.customFields).some(value => typeof value !== 'string' || !value)) {
      throw new BadRequestException('Choose at most 30 valid contact custom fields.');
    }
  }
  async save(accountId: string, dto: SheetSettingsDto) {
    const connection = await this.connections.findOne({ whatsappAccountId: accountId });
    if (!connection?.connected) throw new BadRequestException('Connect Google first.');
    if (connection.lockedUntil > new Date()) throw new ConflictException('Sync is running. Wait before changing settings.');
    if (Object.values(connection.managedTabs || {}).some((tab: any) => tab.spreadsheetId === dto.spreadsheetId && tab.sheetId === dto.sheetId)) {
      throw new BadRequestException('Choose a source tab, not a WMS output tab.');
    }
    const table = await this.table(await this.google.accessToken(accountId), dto);
    this.validateColumns(dto, table.headers);
    const fields = await this.contacts.getCustomFields(accountId);
    if (Object.keys(dto.customFields).some(key => !fields.some(field => field.key === key))) throw new BadRequestException('Create contact custom fields before mapping them.');
    if (dto.automation !== 'off') await this.validateTemplate(accountId, dto);
    const updated = await this.connections.findOneAndUpdate({ _id: connection._id, revision: connection.revision,
      $or: [{ lockedUntil: { $lte: new Date() } }, { lockedUntil: null }] }, { $set: { settings: dto, lastError: '' }, $inc: { revision: 1 } });
    if (!updated) throw new ConflictException('Settings changed or sync started. Reload and try again.');
    return this.status(accountId);
  }
  private async validateTemplate(accountId: string, settings: any) {
    const template = await this.templates.findByName(accountId, settings.templateName);
    if (!template || template.status?.toUpperCase() !== 'APPROVED') throw new BadRequestException('Choose an approved template.');
    const body = template.components?.find(c => c.type?.toUpperCase() === 'BODY');
    const variables = [...new Set(String(body?.text || '').match(/\{\{[^}]+\}\}/g) || [])];
    if (variables.some(v => !/^\{\{\d+\}\}$/.test(v))) throw new BadRequestException('Sheets automation currently supports numbered body variables only.');
    const count = Math.max(0, ...variables.map(v => Number(v.slice(2, -2))));
    if (count !== settings.parameterColumns.length || settings.parameterColumns.some(column => !column)) throw new BadRequestException(`Map ${count} body parameters for this template, in order.`);
    const unsupported = template.components?.some(c => {
      const type = c.type?.toUpperCase();
      return type === 'HEADER' && (c.format !== 'TEXT' || /\{\{/.test(c.text || ''))
        || type === 'BUTTONS' && c.buttons?.some(b => /\{\{/.test(b.url || '') || b.type === 'COPY_CODE');
    });
    if (unsupported) throw new BadRequestException('Choose a template without dynamic headers, media, or dynamic buttons.');
    return template;
  }
  @Cron('0 * * * * *')
  async scheduledSync() {
    const items = await this.connections.find({ connected: true, 'settings.enabled': true }).select('whatsappAccountId settings lastSyncAt').lean();
    for (const item of items) {
      if (Date.now() - new Date(item.lastSyncAt || 0).getTime() < (item.settings.intervalMinutes || 15) * 60000) continue;
      try { await this.sync(String(item.whatsappAccountId)); } catch { /* Stored on the connection for the UI. */ }
    }
  }
  async sync(accountId: string) {
    const owner = randomBytes(16).toString('hex');
    const connection = await this.connections.findOneAndUpdate({ whatsappAccountId: accountId, connected: true,
      $or: [{ lockedUntil: { $lte: new Date() } }, { lockedUntil: null }] },
      { lockOwner: owner, lockedUntil: new Date(Date.now() + 120000) }, { new: true });
    if (!connection) throw new ConflictException('Connect Google first, or wait for the current sync.');
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      this.connections.updateOne({ _id: connection._id, lockOwner: owner }, { lockedUntil: new Date(Date.now() + 120000) })
        .then(result => { if (!result.matchedCount) leaseLost = true; }).catch(() => { leaseLost = true; });
    }, 30000);
    const active = async () => {
      if (leaseLost || !await this.connections.exists({ _id: connection._id, connected: true, revision: connection.revision, lockOwner: owner })) {
        throw new ConflictException('Connection changed during sync. Run sync again.');
      }
    };
    try {
      const account = await this.accounts.findOne(accountId);
      if (!account?.isActive || account.isRemoved) throw new BadRequestException('WhatsApp account is inactive.');
      const tenant = await this.tenants.findById(account.tenantId);
      if (!tenant || tenant.status !== 'active') throw new BadRequestException('This client account is not active.');
      const settings = connection.settings as SheetSettingsDto;
      if (!settings.spreadsheetId) throw new BadRequestException('Save a spreadsheet and column mapping first.');
      const token = await this.google.accessToken(accountId);
      const table = await this.table(token, settings);
      this.validateColumns(settings, table.headers);
      const result: any = { rows: table.rows.length, imported: 0, sent: 0, skipped: 0, invalid: 0, failed: 0, warnings: [] };
      const counts = new Map<string, number>();
      for (const row of table.rows) {
        const phone = phoneNumber(row.data[settings.phoneColumn]);
        if (phone) counts.set(phone, (counts.get(phone) || 0) + 1);
      }
      const template = settings.enabled && settings.automation !== 'off' ? await this.validateTemplate(accountId, settings) : null;
      const importRows = [];
      const existing = await this.contactModel.find(whatsappAccountIdFilter(accountId)).lean();
      const byPhone = new Map(existing.map(contact => [contact.phone, contact]));
      for (const row of table.rows) {
        const phone = phoneNumber(row.data[settings.phoneColumn]);
        if (!phone || counts.get(phone) !== 1) { result.invalid++; continue; }
        const contact = byPhone.get(phone);
        if (contact && (!contact.isActive || contact.isOptedOut)) { result.skipped++; continue; }
        if (settings.importContacts) {
          const variables = { ...(contact?.variables || {}) };
          settings.parameterColumns.forEach((col, i) => { variables[String(i + 1)] = row.data[col]; });
          const customFields = { ...(contact?.customFields || {}) };
          Object.entries(settings.customFields).forEach(([key, col]) => { customFields[key] = row.data[col]; });
          const next = { rowNumber: row.rowNumber, phone, name: settings.nameColumn ? row.data[settings.nameColumn] : contact?.name || '',
            tags: settings.tagsColumn ? row.data[settings.tagsColumn].split(',').map(v => v.trim()).filter(Boolean) : contact?.tags || [], variables, customFields };
          if (!contact || ['name', 'tags', 'variables', 'customFields'].some(key => JSON.stringify(next[key]) !== JSON.stringify(contact[key] ?? (key === 'name' ? '' : key === 'tags' ? [] : {})))) importRows.push(next);
        }
      }
      await active();
      if (importRows.length) {
        const imported = await this.contacts.commitImport(accountId, importRows, { fileName: `Google Sheets: ${table.title}`, updateExisting: true });
        result.imported = imported.createdCount + imported.updatedCount;
      }
      const updates = [];
      for (const row of table.rows) {
        const phone = phoneNumber(row.data[settings.phoneColumn]);
        if (!phone || counts.get(phone) !== 1) continue;
        const due = settings.automation === 'due_date' ? dueTime(row.data[settings.dueColumn]) : null;
        const trigger = settings.automation === 'due_date' ? due : 'new_row';
        const key = hash([accountId, settings.spreadsheetId, settings.sheetId, phone, trigger].join('|'));
        let event = trigger ? await this.events.findOne({ key }) : null;
        if (template && !event && consentGiven(row.data[settings.consentColumn])) {
          if (settings.automation === 'due_date' && !due) { result.invalid++; continue; }
          if (due && new Date(due) > new Date()) continue;
          const contact = await this.contactModel.findOne({ ...whatsappAccountIdFilter(accountId), phone });
          if (contact && (!contact.isActive || contact.isOptedOut)) { result.skipped++; continue; }
          const params = settings.parameterColumns.map(col => row.data[col]);
          if (params.some(v => !v)) { result.invalid++; continue; }
          await active();
          try { event = await this.events.create({ whatsappAccountId: accountId, key, phone, trigger, status: 'processing' }); }
          catch (err) { if (err.code === 11000) continue; throw err; }
          // Persist the claim before contacting Meta. Never automatically retry
          // an ambiguous send after a process crash or network timeout.
          try {
            const message = await this.inbox.sendTemplate(accountId, phone, template.name, template.language, params);
            await this.events.updateOne({ _id: event._id }, { status: 'sent', messageId: message._id });
            event.status = 'sent'; event.messageId = message._id;
            result.sent++;
          } catch {
            event.status = 'needs_review';
            event.error = 'Send did not complete. Check Inbox and wallet before sending again manually.';
            await this.events.updateOne({ _id: event._id }, { status: event.status, error: event.error });
            result.failed++;
          }
        }
        if (event && settings.statusColumn) {
          const message = event.messageId ? await this.messages.findById(event.messageId).lean() : null;
          const status = message?.deliveryStatus || (event.status === 'processing' ? 'needs_review' : event.status);
          if (row.data[settings.statusColumn] !== status) updates.push({ phone, status, due });
        }
      }
      await active();
      if (updates.length) {
        // Re-read before writing: users may sort rows while a sync is running.
        const fresh = await this.table(token, settings);
        this.validateColumns(settings, fresh.headers);
        const data = updates.flatMap(update => {
          const matches = fresh.rows.filter(row => phoneNumber(row.data[settings.phoneColumn]) === update.phone);
          if (matches.length !== 1) return [];
          if (settings.automation === 'due_date' && dueTime(matches[0].data[settings.dueColumn]) !== update.due) return [];
          return [{ range: tabRange(fresh.title, `${columnName(fresh.headers.indexOf(settings.statusColumn))}${matches[0].rowNumber}`), values: [[update.status]] }];
        });
        if (data.length) await this.google.request(token, 'POST', settings.spreadsheetId, '/values:batchUpdate', { valueInputOption: 'RAW', data });
      }
      if (settings.exportLeads) { await active(); result.leads = await this.exportLeads(connection, token); }
      if (settings.exportReports) { await active(); result.reports = await this.exportReports(connection, token); }
      if (result.invalid) result.warnings.push('Invalid phones, duplicate phones, missing parameters, or invalid reminder dates were skipped.');
      await this.connections.updateOne({ _id: connection._id, lockOwner: owner, revision: connection.revision }, { lastSyncAt: new Date(), lastError: '', lastResult: result });
      return result;
    } catch (error) {
      const message = error instanceof BadRequestException || error instanceof ConflictException ? error.message : 'Sync failed. Check configuration and try again.';
      await this.connections.updateOne({ _id: connection._id, lockOwner: owner }, { lastSyncAt: new Date(), lastError: message });
      throw new BadRequestException(message);
    } finally {
      clearInterval(heartbeat);
      await this.connections.updateOne({ _id: connection._id, lockOwner: owner }, { $unset: { lockOwner: 1, lockedUntil: 1 } });
    }
  }
  private async managedTab(connection: any, token: string, kind: string, headers: string[]) {
    const spreadsheetId = connection.settings.spreadsheetId;
    let saved = connection.managedTabs?.[kind];
    const book = await this.google.request(token, 'GET', spreadsheetId, '?fields=sheets(properties)');
    let tab = saved?.spreadsheetId === spreadsheetId ? book.sheets.find(s => s.properties.sheetId === saved.sheetId)?.properties : null;
    if (!tab) {
      const title = `WMS ${kind} ${randomBytes(4).toString('hex')}`;
      const response = await this.google.request(token, 'POST', spreadsheetId, ':batchUpdate', { requests: [{ addSheet: { properties: { title, gridProperties: { rowCount: 10001, columnCount: Math.max(headers.length, 26) } } } }] });
      tab = response.replies[0].addSheet.properties;
      saved = { spreadsheetId, sheetId: tab.sheetId };
      await this.connections.updateOne({ _id: connection._id }, { $set: { [`managedTabs.${kind}`]: saved } });
      connection.managedTabs = { ...connection.managedTabs, [kind]: saved };
      await this.google.request(token, 'PUT', spreadsheetId, `/values/${encodeURIComponent(tabRange(tab.title, 'A1'))}?valueInputOption=RAW`, { values: [headers] });
    }
    return tab.title as string;
  }
  private async exportLeads(connection: any, token: string) {
    const headers = ['Phone', 'Name', 'Latest message', 'Last received', 'Inbox status', 'Assigned user ID', 'Lead status', 'Next follow-up', 'Notes'];
    const title = await this.managedTab(connection, token, 'Leads', headers);
    const spreadsheetId = connection.settings.spreadsheetId;
    const data = await this.google.request(token, 'GET', spreadsheetId, `/values/${encodeURIComponent(tabRange(title, 'A1:I10001'))}`);
    const values = data.values || [];
    if (headers.some((header, i) => values[0]?.[i] !== header)) throw new BadRequestException('Restore the original WMS Leads column headers before syncing.');
    const leads = await this.messages.aggregate([
      { $match: { ...whatsappAccountIdFilter(String(connection.whatsappAccountId)), direction: 'inbound' } },
      { $sort: { timestamp: -1, _id: -1 } }, { $group: { _id: '$phone', latest: { $first: '$$ROOT' } } }, { $limit: 5001 },
    ]);
    if (leads.length > 5000) throw new BadRequestException('Lead export supports up to 5,000 unique inbound numbers.');
    let nextRow = values.length + 1;
    const updates = leads.map(({ latest: lead }) => {
      const phone = phoneNumber(lead.phone);
      if (!phone) return null;
      const matches = values.map((row, i) => i > 0 && phoneNumber(row[0]) === phone ? i : -1).filter(i => i >= 0);
      if (matches.length > 1) throw new BadRequestException('Remove duplicate phone rows from the WMS Leads tab.');
      const row = matches.length ? matches[0] + 1 : nextRow++;
      return { range: tabRange(title, `A${row}:F${row}`), values: [[phone, lead.contactName || '', lead.text || '',
        lead.timestamp ? new Date(lead.timestamp).toISOString() : '', lead.threadStatus || '', String(lead.assignedTo || '')]] };
    }).filter(Boolean);
    if (nextRow > 10002) throw new BadRequestException('WMS Leads tab has reached its 10,000-row limit.');
    if (updates.length) await this.google.request(token, 'POST', spreadsheetId, '/values:batchUpdate', { valueInputOption: 'RAW', data: updates });
    return { rows: updates.length, tab: title, note: 'Lead status, Next follow-up and Notes columns are preserved.' };
  }
  private async exportReports(connection: any, token: string) {
    const headers = ['Source', 'Record ID', 'Campaign ID', 'Phone', 'Name', 'Status', 'Message ID', 'Error', 'Sent at'];
    const title = await this.managedTab(connection, token, 'Reports', headers);
    const scope = whatsappAccountIdFilter(String(connection.whatsappAccountId));
    const [logs, messages] = await Promise.all([
      this.logs.find(scope).sort({ createdAt: -1 }).limit(2500).lean(),
      this.messages.find({ ...scope, direction: 'outbound' }).sort({ createdAt: -1 }).limit(2500).lean(),
    ]);
    const rows = [headers, ...logs.map(log => ['Campaign', String(log._id), String(log.broadcastId), log.phone, log.contactName || '', log.status,
      log.waMessageId || '', log.errorMessage || '', log.sentAt ? new Date(log.sentAt).toISOString() : '']),
      ...messages.map(message => ['Inbox / automation', String(message._id), '', message.phone, message.contactName || '', message.deliveryStatus || '',
        message.waMessageId || '', message.errorMessage || '', message.sentAt ? new Date(message.sentAt).toISOString() : ''])];
    // A fixed-size snapshot clears stale rows in the integration-owned tab in a
    // single request; RAW prevents customer text from becoming formulas.
    const padded = [...rows, ...Array.from({ length: Math.max(0, 5001 - rows.length) }, () => Array(9).fill(''))];
    await this.google.request(token, 'PUT', connection.settings.spreadsheetId,
      `/values/${encodeURIComponent(tabRange(title, 'A1:I5001'))}?valueInputOption=RAW`, { values: padded });
    return { rows: rows.length - 1, tab: title, note: 'Latest 2,500 campaign records and 2,500 outbound inbox / automation records.' };
  }
}
