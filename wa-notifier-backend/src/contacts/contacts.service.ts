import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from './contact.schema';
import { ContactTag, ContactTagDocument } from './contact-tag.schema';
import { ContactImport, ContactImportDocument } from './contact-import.schema';
import { ContactSegment, ContactSegmentDocument } from './contact-segment.schema';
import { buildSegmentQuery, validateSegmentConditions, SegmentCondition } from './segment-query';
import { ContactCustomField, ContactCustomFieldDocument, ContactCustomFieldType } from './contact-custom-field.schema';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { resolveWhatsAppAccountId, toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class ContactsService {
  constructor(
    @InjectModel(Contact.name) private model: Model<ContactDocument>,
    @InjectModel(ContactTag.name) private tagModel: Model<ContactTagDocument>,
    @InjectModel(ContactImport.name) private importModel: Model<ContactImportDocument>,
    @InjectModel(ContactSegment.name) private segmentModel: Model<ContactSegmentDocument>,
    @InjectModel(ContactCustomField.name) private customFieldModel: Model<ContactCustomFieldDocument>,
    private clients: WhatsAppAccountsService,
    private subscriptions: SubscriptionsService,
  ) {}

  findAll(whatsappAccountId: string, tag?: string) {
    const q: any = { ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true };
    if (tag) q.tags = tag;
    return this.model.find(q);
  }

  findByIds(ids: Types.ObjectId[]) { return this.model.find({ _id: { $in: ids } }); }

  async create(dto: Partial<Omit<Contact, 'whatsappAccountId' | 'clientId'>> & { whatsappAccountId?: string; clientId?: string }) {
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    if (!account) throw new NotFoundException('WhatsApp account not found');
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const phone = this.normalizePhone(dto.phone);
    if (!this.isValidPhone(phone)) {
      throw new BadRequestException('Enter a valid phone number in E.164 format, e.g. +919876543210');
    }
    const existing = await this.model.findOne({ ...this.whatsappAccountIdQuery(whatsappAccountId), phone });
    if (existing) {
      throw new BadRequestException('A contact with this phone number already exists for this WhatsApp account');
    }
    const tags = await this.allowedTags(whatsappAccountId, dto.tags || []);
    const requestedCustomFields = this.compactCustomFieldValues(dto.customFields || {});
    const customFields = Object.keys(requestedCustomFields).length
      ? await this.allowedCustomFieldValues(whatsappAccountId, requestedCustomFields)
      : {};
    try {
      return await this.model.create({
        ...dto,
        whatsappAccountId: accountObjectId,
        clientId: accountObjectId,
        tenantId: account?.tenantId,
        phone,
        tags,
        customFields,
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw new BadRequestException('A contact with this phone number already exists for this WhatsApp account');
      }
      throw err;
    }
  }

  async bulkUpsert(whatsappAccountId: string, contacts: Partial<Contact>[]) {
    const account = await this.clients.findOne(whatsappAccountId);
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const valid = contacts
      .filter(c => c.phone && String(c.phone).trim().length > 0)
      .map(c => ({ ...c, phone: String(c.phone).trim() }));
    const tagResult = await this.ensureTags(whatsappAccountId, valid.flatMap((contact) => contact.tags || []));
    const allowed = tagResult.allowed;
    const customFieldDefinitions = await this.customFieldDefinitionMap(whatsappAccountId);

    if (valid.length === 0) return { upsertedCount: 0, modifiedCount: 0, skipped: contacts.length };

    const ops = valid.map(c => ({
      updateOne: {
        filter: { whatsappAccountId: accountObjectId, phone: c.phone },
        update: { $set: { ...c, tags: this.filterAllowedTags(c.tags || [], allowed), customFields: this.filterCustomFieldValues(c.customFields || {}, customFieldDefinitions), whatsappAccountId: accountObjectId, tenantId: account?.tenantId } },
        upsert: true,
      },
    }));
    const result = await this.model.bulkWrite(ops);
    return {
      ...result,
      skipped: contacts.length - valid.length,
      createdTags: tagResult.createdTags,
      reactivatedTags: tagResult.reactivatedTags,
    };
  }

  async previewImport(
    whatsappAccountId: string,
    contacts: Array<Partial<Contact> & { rowNumber?: number }>,
    metadata: { fileName?: string; mapping?: Record<string, string> } = {},
  ) {
    const analysis = await this.analyzeImport(whatsappAccountId, contacts);
    return {
      ...analysis.summary,
      fileName: metadata.fileName || 'contacts.csv',
      mapping: metadata.mapping || {},
      rows: analysis.rows.slice(0, 200),
      invalidReport: analysis.invalidReport.slice(0, 100),
      duplicateReport: analysis.duplicateReport.slice(0, 100),
    };
  }

  async commitImport(
    whatsappAccountId: string,
    contacts: Array<Partial<Contact> & { rowNumber?: number }>,
    metadata: { fileName?: string; mapping?: Record<string, string>; updateExisting?: boolean } = {},
  ) {
    const account = await this.clients.findOne(whatsappAccountId);
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const analysis = await this.analyzeImport(whatsappAccountId, contacts);
    const updateExisting = metadata.updateExisting === true;
    const importable = analysis.rows.filter((row) => row.status === 'new' || (row.status === 'existing' && updateExisting));
    const tagResult = await this.ensureTags(whatsappAccountId, importable.flatMap((row) => row.tags || []));
    const allowed = tagResult.allowed;
    const customFieldDefinitions = await this.customFieldDefinitionMap(whatsappAccountId);

    const ops = importable.map((row) => ({
      updateOne: {
        filter: { whatsappAccountId: accountObjectId, phone: row.phone },
        update: {
          $set: {
            phone: row.phone,
            name: row.name,
            tags: this.filterAllowedTags(row.tags || [], allowed),
            variables: row.variables || {},
            customFields: this.filterCustomFieldValues(row.customFields || {}, customFieldDefinitions),
            whatsappAccountId: accountObjectId,
            tenantId: account?.tenantId,
            isActive: true,
          },
        },
        upsert: true,
      },
    }));

    const result = ops.length ? await this.model.bulkWrite(ops) : null;
    const createdCount = Number(result?.upsertedCount || 0);
    const updatedCount = importable.filter((row) => row.status === 'existing').length;
    const skippedCount = analysis.summary.totalRows - importable.length;

    const history = await this.importModel.create({
      whatsappAccountId: accountObjectId,
      tenantId: account?.tenantId,
      fileName: metadata.fileName || 'contacts.csv',
      status: 'completed',
      mapping: metadata.mapping || {},
      totalRows: analysis.summary.totalRows,
      validRows: analysis.summary.validRows,
      importableRows: importable.length,
      createdCount,
      updatedCount,
      skippedCount,
      invalidRows: analysis.summary.invalidRows,
      duplicateRows: analysis.summary.duplicateRows,
      existingRows: analysis.summary.existingRows,
      fileDuplicateRows: analysis.summary.fileDuplicateRows,
      invalidReport: analysis.invalidReport.slice(0, 100),
      duplicateReport: analysis.duplicateReport.slice(0, 100),
    });

    return {
      importId: history._id,
      totalRows: analysis.summary.totalRows,
      validRows: analysis.summary.validRows,
      importedRows: importable.length,
      createdCount,
      updatedCount,
      skippedCount,
      invalidRows: analysis.summary.invalidRows,
      duplicateRows: analysis.summary.duplicateRows,
      existingRows: analysis.summary.existingRows,
      fileDuplicateRows: analysis.summary.fileDuplicateRows,
      invalidReport: analysis.invalidReport.slice(0, 100),
      duplicateReport: analysis.duplicateReport.slice(0, 100),
      createdTags: tagResult.createdTags,
      reactivatedTags: tagResult.reactivatedTags,
    };
  }

  importHistory(whatsappAccountId: string) {
    return this.importModel
      .find(this.whatsappAccountIdQuery(whatsappAccountId))
      .sort({ createdAt: -1 })
      .limit(25);
  }

  async update(id: string, dto: Partial<Contact>) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Contact not found');
    const next: Partial<Contact> = { ...dto };
    if (dto.tags) next.tags = await this.allowedTags(String(existing.whatsappAccountId || (existing as any).clientId), dto.tags);
    if (dto.customFields) {
      next.customFields = await this.allowedCustomFieldValues(String(existing.whatsappAccountId || (existing as any).clientId), dto.customFields);
    }
    return this.model.findByIdAndUpdate(id, next, { new: true });
  }

  remove(id: string) { return this.model.findByIdAndDelete(id); }

  async getTags(whatsappAccountId: string) {
    await this.ensureLegacyTags(whatsappAccountId);
    return this.tagModel.find({ ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true }).sort({ name: 1 });
  }

  async createTag(dto: { whatsappAccountId?: string; clientId?: string; name: string; color?: string; description?: string }) {
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    const name = this.cleanTagName(dto.name);
    if (!name) throw new BadRequestException('Tag name is required');
    const normalizedName = this.normalizeTag(name);
    const existing = await this.tagModel.findOne({ ...this.whatsappAccountIdQuery(whatsappAccountId), normalizedName });
    if (existing?.isActive) {
      throw new BadRequestException('A tag with this name already exists for this WhatsApp account');
    }
    await this.assertTagCapacity(whatsappAccountId, account, 1);
    if (existing) {
      return this.tagModel.findByIdAndUpdate(
        existing._id,
        {
          name,
          normalizedName,
          color: dto.color || existing.color || '#3b82f6',
          description: dto.description,
          tenantId: account?.tenantId,
          isActive: true,
        },
        { new: true },
      );
    }
    try {
      return await this.tagModel.create({
        whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
        tenantId: account?.tenantId,
        name,
        normalizedName,
        color: dto.color || '#3b82f6',
        description: dto.description,
      });
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A tag with this name already exists for this WhatsApp account');
      throw err;
    }
  }

  async getCustomFields(whatsappAccountId: string) {
    return this.customFieldModel
      .find({ ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true })
      .sort({ label: 1 });
  }

  async createCustomField(dto: { whatsappAccountId?: string; clientId?: string; label: string; key?: string; type?: ContactCustomFieldType; description?: string }) {
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    const label = this.cleanCustomFieldLabel(dto.label);
    if (!label) throw new BadRequestException('Field label is required');
    const key = this.normalizeCustomFieldKey(dto.key || label);
    if (!key) throw new BadRequestException('Field key is required');

    const existing = await this.customFieldModel.findOne({ ...this.whatsappAccountIdQuery(whatsappAccountId), key });
    if (existing?.isActive) {
      throw new BadRequestException('A custom field with this name already exists for this WhatsApp account');
    }
    await this.assertCustomFieldCapacity(whatsappAccountId, account, 1);

    if (existing) {
      return this.customFieldModel.findByIdAndUpdate(
        existing._id,
        {
          label,
          type: this.normalizeCustomFieldType(dto.type),
          description: dto.description || '',
          tenantId: account?.tenantId,
          isActive: true,
        },
        { new: true },
      );
    }

    try {
      return await this.customFieldModel.create({
        whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
        tenantId: account?.tenantId,
        label,
        key,
        type: this.normalizeCustomFieldType(dto.type),
        description: dto.description || '',
      });
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A custom field with this name already exists for this WhatsApp account');
      throw err;
    }
  }

  async updateCustomField(id: string, dto: Partial<ContactCustomField>) {
    const existing = await this.customFieldModel.findById(id);
    if (!existing) throw new NotFoundException('Custom field not found');
    const next: Partial<ContactCustomField> = { ...dto };
    delete (next as any).key;
    delete (next as any).whatsappAccountId;
    delete (next as any).tenantId;

    if (dto.label !== undefined) {
      const label = this.cleanCustomFieldLabel(dto.label);
      if (!label) throw new BadRequestException('Field label is required');
      next.label = label;
    }
    if (dto.type !== undefined) next.type = this.normalizeCustomFieldType(dto.type);

    if (dto.isActive === true && existing.isActive === false) {
      const whatsappAccountId = String(existing.whatsappAccountId || (existing as any).clientId);
      const account = await this.clients.findOne(whatsappAccountId);
      await this.assertCustomFieldCapacity(whatsappAccountId, account, 1);
    }

    return this.customFieldModel.findByIdAndUpdate(id, next, { new: true });
  }

  async removeCustomField(id: string) {
    const existing = await this.customFieldModel.findById(id);
    if (!existing) throw new NotFoundException('Custom field not found');
    await this.model.updateMany(
      this.whatsappAccountIdQuery(String(existing.whatsappAccountId || (existing as any).clientId)),
      { $unset: { [`customFields.${existing.key}`]: '' } },
    );
    return this.customFieldModel.findByIdAndDelete(id);
  }

  async updateTag(id: string, dto: Partial<ContactTag>) {
    const existing = await this.tagModel.findById(id);
    if (!existing) throw new NotFoundException('Tag not found');
    const oldName = existing.name;
    const next: Partial<ContactTag> = { ...dto };

    if (dto.name !== undefined) {
      const name = this.cleanTagName(dto.name);
      if (!name) throw new BadRequestException('Tag name is required');
      next.name = name;
      next.normalizedName = this.normalizeTag(name);
    }

    try {
      const saved = await this.tagModel.findByIdAndUpdate(id, next, { new: true });
      if (saved && next.name && next.name !== oldName) {
        await this.renameTagOnContacts(String(existing.whatsappAccountId || (existing as any).clientId), oldName, next.name);
        await this.renameTagOnSegments(String(existing.whatsappAccountId || (existing as any).clientId), oldName, next.name);
      }
      return saved;
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A tag with this name already exists for this WhatsApp account');
      throw err;
    }
  }

  async removeTag(id: string) {
    const existing = await this.tagModel.findById(id);
    if (!existing) throw new NotFoundException('Tag not found');
    await this.model.updateMany(this.whatsappAccountIdQuery(String(existing.whatsappAccountId || (existing as any).clientId)), { $pull: { tags: existing.name } });
    await this.segmentModel.updateMany(this.whatsappAccountIdQuery(String(existing.whatsappAccountId || (existing as any).clientId)), { $pull: { tags: existing.name } });
    return this.tagModel.findByIdAndDelete(id);
  }

  async getSegments(whatsappAccountId: string) {
    return this.segmentModel
      .find({ ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true })
      .sort({ createdAt: -1 });
  }

  async createSegment(dto: { whatsappAccountId?: string; clientId?: string; name: string; description?: string; tags?: string[]; conditions?: SegmentCondition[]; matchMode?: 'any' | 'all' }) {
    this.validateSegmentTags(dto.tags);
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    const name = String(dto.name || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Segment name is required');
    const allowed = await this.allowedTagSet(whatsappAccountId);
    const tags = this.filterAllowedTags(dto.tags || [], allowed);
    const conditions = dto.conditions || [];
    validateSegmentConditions(conditions);
    if (!tags.length && !conditions.length) throw new BadRequestException('Add at least one tag or field condition');

    try {
      return await this.segmentModel.create({
        whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
        tenantId: account?.tenantId,
        name,
        description: dto.description,
        conditions,
        tags,
        matchMode: dto.matchMode === 'all' ? 'all' : 'any',
        isActive: true,
      });
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A segment with this name already exists for this WhatsApp account');
      throw err;
    }
  }

  async updateSegment(id: string, dto: Partial<ContactSegment>) {
    this.validateSegmentTags(dto.tags);
    const existing = await this.segmentModel.findById(id);
    if (!existing) throw new NotFoundException('Segment not found');
    const next: Partial<ContactSegment> = { ...dto };
    if (dto.name !== undefined) {
      const name = String(dto.name || '').trim().replace(/\s+/g, ' ');
      if (!name) throw new BadRequestException('Segment name is required');
      next.name = name;
    }
    if (dto.tags !== undefined) {
      next.tags = this.filterAllowedTags(dto.tags, await this.allowedTagSet(String(existing.whatsappAccountId || (existing as any).clientId)));
    }
    next.conditions = dto.conditions ?? existing.conditions ?? [];
    validateSegmentConditions(next.conditions);
    if (!(next.tags ?? existing.tags ?? []).length && !(dto.conditions ?? existing.conditions ?? []).length) {
      throw new BadRequestException('Add at least one tag or field condition');
    }
    if (dto.matchMode !== undefined) next.matchMode = dto.matchMode === 'all' ? 'all' : 'any';
    try {
      return await this.segmentModel.findByIdAndUpdate(id, next, { new: true });
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A segment with this name already exists for this WhatsApp account');
      throw err;
    }
  }

  removeSegment(id: string) {
    return this.segmentModel.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  private validateSegmentTags(tags: unknown) {
    if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string'))) {
      throw new BadRequestException('Segment tags must be an array of strings');
    }
  }

  async countBySegmentIds(whatsappAccountId: string, segmentIds: string[]) {
    return (await this.findBySegmentIds(whatsappAccountId, segmentIds)).length;
  }

  countBySegment(whatsappAccountId: string, tags: string[], matchMode: 'any' | 'all' = 'any') {
    const q: any = { ...this.whatsappAccountIdQuery(whatsappAccountId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = matchMode === 'all' ? { $all: tags } : { $in: tags };
    return this.model.countDocuments(q);
  }

  async findBySegmentIds(whatsappAccountId: string, segmentIds: string[]) {
    const ids = (segmentIds || []).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (!ids.length) return [];
    const segments = await this.segmentModel.find({
      ...this.whatsappAccountIdQuery(whatsappAccountId),
      _id: { $in: ids },
      isActive: true,
    });
    const groupQueries = segments.map((segment) => buildSegmentQuery(segment));
    if (!groupQueries.length) return [];
    return this.model.find({
      isOptedOut: false,
      isActive: true,
      $and: [this.whatsappAccountIdQuery(whatsappAccountId), { $or: groupQueries }],
    });
  }

  findBySegment(whatsappAccountId: string, tags: string[], matchMode: 'any' | 'all' = 'any') {
    const q: any = { ...this.whatsappAccountIdQuery(whatsappAccountId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = matchMode === 'all' ? { $all: tags } : { $in: tags };
    return this.model.find(q);
  }

  private async analyzeImport(whatsappAccountId: string, contacts: Array<Partial<Contact> & { rowNumber?: number }>) {
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const prepared = contacts.map((contact, index) => {
      const rowNumber = Number(contact.rowNumber || index + 2);
      const phone = this.normalizePhone(contact.phone);
      const tags = Array.isArray(contact.tags) ? contact.tags.map((tag) => this.cleanTagName(tag)).filter(Boolean) : [];
      const variables = contact.variables && typeof contact.variables === 'object' ? contact.variables : {};
      const customFields = contact.customFields && typeof contact.customFields === 'object' ? contact.customFields : {};
      return {
        rowNumber,
        phone,
        originalPhone: String(contact.phone || '').trim(),
        name: String(contact.name || '').trim(),
        tags,
        variables,
        customFields,
      };
    });

    const validPhoneSet = new Set(prepared.filter((row) => this.isValidPhone(row.phone)).map((row) => row.phone));
    const existing = validPhoneSet.size
      ? await this.model.find({ ...this.whatsappAccountIdQuery(whatsappAccountId), phone: { $in: Array.from(validPhoneSet) } }).select('phone name')
      : [];
    const existingByPhone = new Map(existing.map((contact) => [contact.phone, contact]));
    const seen = new Set<string>();
    const invalidReport = [];
    const duplicateReport = [];

    const rows = prepared.map((row) => {
      if (!row.phone) {
        const item = { rowNumber: row.rowNumber, phone: row.originalPhone, reason: 'Missing phone number' };
        invalidReport.push(item);
        return { ...row, status: 'invalid', reason: item.reason };
      }

      if (!this.isValidPhone(row.phone)) {
        const item = { rowNumber: row.rowNumber, phone: row.originalPhone, normalizedPhone: row.phone, reason: 'Invalid phone number' };
        invalidReport.push(item);
        return { ...row, status: 'invalid', reason: item.reason };
      }

      if (seen.has(row.phone)) {
        const item = { rowNumber: row.rowNumber, phone: row.phone, reason: 'Duplicate phone number inside this CSV' };
        duplicateReport.push(item);
        return { ...row, status: 'duplicate_file', reason: item.reason };
      }

      seen.add(row.phone);
      if (existingByPhone.has(row.phone)) {
        const item = { rowNumber: row.rowNumber, phone: row.phone, reason: 'Contact already exists and was skipped' };
        duplicateReport.push(item);
        return { ...row, status: 'existing', reason: item.reason };
      }

      return { ...row, status: 'new', reason: 'Ready to import' };
    });

    const validRows = rows.filter((row) => row.status !== 'invalid').length;
    const importableRows = rows.filter((row) => row.status === 'new').length;
    const duplicateRows = rows.filter((row) => row.status === 'duplicate_file' || row.status === 'existing').length;

    return {
      rows,
      invalidReport,
      duplicateReport,
      summary: {
        totalRows: rows.length,
        validRows,
        importableRows,
        newRows: rows.filter((row) => row.status === 'new').length,
        existingRows: rows.filter((row) => row.status === 'existing').length,
        invalidRows: rows.filter((row) => row.status === 'invalid').length,
        duplicateRows,
        fileDuplicateRows: rows.filter((row) => row.status === 'duplicate_file').length,
      },
    };
  }

  private normalizePhone(value: unknown) {
    const raw = String(value || '').trim();
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return '';
    return `+${digits}`;
  }

  private isValidPhone(phone: string) {
    return /^\+[1-9]\d{7,14}$/.test(phone);
  }

  private whatsappAccountIdQuery(id: string) {
    return whatsappAccountIdFilter(id);
  }

  private cleanTagName(name?: string) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  }

  private normalizeTag(name?: string) {
    return this.cleanTagName(name).toLowerCase();
  }

  private cleanCustomFieldLabel(label?: string) {
    return String(label || '').trim().replace(/\s+/g, ' ');
  }

  private normalizeCustomFieldKey(value?: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
  }

  private normalizeCustomFieldType(type?: ContactCustomFieldType) {
    return Object.values(ContactCustomFieldType).includes(type) ? type : ContactCustomFieldType.TEXT;
  }

  private async customFieldDefinitionMap(whatsappAccountId: string) {
    const fields = await this.customFieldModel
      .find({ ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true })
      .select('key type');
    return new Map(fields.map((field) => [field.key, field.type]));
  }

  private filterCustomFieldValues(values: Record<string, any>, definitions: Map<string, ContactCustomFieldType>) {
    return Object.fromEntries(
      Object.entries(this.compactCustomFieldValues(values || {}))
        .filter(([key]) => definitions.has(key))
        .map(([key, value]) => [key, this.normalizeCustomFieldValue(value, definitions.get(key))]),
    );
  }

  private compactCustomFieldValues(values: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(values || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ''),
    );
  }

  private async allowedCustomFieldValues(whatsappAccountId: string, values: Record<string, any>) {
    return this.filterCustomFieldValues(values, await this.customFieldDefinitionMap(whatsappAccountId));
  }

  private normalizeCustomFieldValue(value: any, type?: ContactCustomFieldType) {
    if (value === undefined || value === null) return '';
    if (type === ContactCustomFieldType.NUMBER) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : '';
    }
    if (type === ContactCustomFieldType.BOOLEAN) {
      if (typeof value === 'boolean') return value;
      const text = String(value).trim().toLowerCase();
      if (!text) return '';
      return ['true', 'yes', '1', 'y'].includes(text);
    }
    return String(value).trim();
  }

  private async allowedTagSet(whatsappAccountId: string) {
    await this.ensureLegacyTags(whatsappAccountId);
    const tags = await this.tagModel.find({ ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true }).select('name normalizedName');
    return new Map(tags.map((tag) => [tag.normalizedName, tag.name]));
  }

  private filterAllowedTags(tags: string[], allowed: Map<string, string>) {
    const selected = tags
      .map((tag) => allowed.get(this.normalizeTag(tag)))
      .filter(Boolean) as string[];
    return Array.from(new Set(selected));
  }

  private async allowedTags(whatsappAccountId: string, tags: string[]) {
    return this.filterAllowedTags(tags, await this.allowedTagSet(whatsappAccountId));
  }

  private async ensureTags(whatsappAccountId: string, tags: string[]) {
    await this.ensureLegacyTags(whatsappAccountId);
    const cleanByNormalized = new Map(
      tags
        .map((tag) => this.cleanTagName(tag))
        .filter(Boolean)
        .map((name) => [this.normalizeTag(name), name]),
    );

    if (!cleanByNormalized.size) {
      return { allowed: await this.allowedTagSet(whatsappAccountId), createdTags: [], reactivatedTags: [] };
    }

    const account = await this.clients.findOne(whatsappAccountId);
    const normalizedNames = Array.from(cleanByNormalized.keys());
    const existingTags = await this.tagModel
      .find({ ...this.whatsappAccountIdQuery(whatsappAccountId), normalizedName: { $in: normalizedNames } })
      .select('normalizedName isActive');
    const existing = new Set(existingTags.map((tag) => tag.normalizedName));

    const inactiveNames = existingTags
      .filter((tag) => !tag.isActive)
      .map((tag) => tag.normalizedName);
    const missing = normalizedNames.filter((normalizedName) => !existing.has(normalizedName));
    const createdTags = missing.map((normalizedName) => cleanByNormalized.get(normalizedName)).filter(Boolean) as string[];
    const reactivatedTags = inactiveNames.map((normalizedName) => cleanByNormalized.get(normalizedName)).filter(Boolean) as string[];
    await this.assertTagCapacity(whatsappAccountId, account, missing.length + inactiveNames.length);

    if (inactiveNames.length) {
      await this.tagModel.updateMany(
        { ...this.whatsappAccountIdQuery(whatsappAccountId), normalizedName: { $in: inactiveNames } },
        { $set: { isActive: true } },
      );
    }

    if (missing.length) {
      await this.tagModel.insertMany(missing.map((normalizedName) => ({
        whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
        tenantId: account?.tenantId,
        name: cleanByNormalized.get(normalizedName),
        normalizedName,
        color: '#3b82f6',
      })), { ordered: false }).catch((err) => {
        const duplicateOnly = err?.code === 11000
          || (Array.isArray(err?.writeErrors) && err.writeErrors.every((item: any) => item?.code === 11000));
        if (!duplicateOnly) throw err;
      });
    }

    return { allowed: await this.allowedTagSet(whatsappAccountId), createdTags, reactivatedTags };
  }

  private async assertTagCapacity(whatsappAccountId: string, account: any, addedActiveTags: number) {
    if (addedActiveTags <= 0 || !account?.tenantId) return;

    const subscription = await this.subscriptions.currentForTenant(String(account.tenantId));
    const plan = subscription?.planId as any;
    const limit = this.resolveTagLimit(plan);
    if (limit === null) return;

    const activeCount = await this.tagModel.countDocuments(this.activeTagCountFilter(whatsappAccountId, account));
    if (activeCount + addedActiveTags <= limit) return;

    throw new BadRequestException(
      `Your current plan allows ${limit} custom tag${limit === 1 ? '' : 's'}. Delete unused tags or upgrade the plan to add more.`,
    );
  }

  private resolveTagLimit(plan: any): number | null {
    const raw = plan?.tags ?? plan?.limits?.tags;
    if (raw === null || raw === undefined || raw === '') return null;
    const limit = Number(raw);
    return Number.isFinite(limit) && limit >= 0 ? limit : null;
  }

  private async assertCustomFieldCapacity(whatsappAccountId: string, account: any, addedActiveFields: number) {
    if (addedActiveFields <= 0 || !account?.tenantId) return;

    const subscription = await this.subscriptions.currentForTenant(String(account.tenantId));
    const plan = subscription?.planId as any;
    const limit = this.resolveCustomFieldLimit(plan);
    if (limit === null) return;

    const activeCount = await this.customFieldModel.countDocuments(this.activeCustomFieldCountFilter(whatsappAccountId, account));
    if (activeCount + addedActiveFields <= limit) return;

    throw new BadRequestException(
      `Your current plan allows ${limit} custom contact field${limit === 1 ? '' : 's'}. Delete unused fields or upgrade the plan to add more.`,
    );
  }

  private resolveCustomFieldLimit(plan: any): number | null {
    const raw = plan?.customFields ?? plan?.limits?.customFields;
    if (raw === null || raw === undefined || raw === '') return null;
    const limit = Number(raw);
    return Number.isFinite(limit) && limit >= 0 ? limit : null;
  }

  private activeCustomFieldCountFilter(whatsappAccountId: string, account: any) {
    if (account?.tenantId) {
      return {
        isActive: true,
        $or: [
          { tenantId: account.tenantId },
          ...this.whatsappAccountIdQuery(whatsappAccountId).$or,
        ],
      };
    }
    return {
      ...this.whatsappAccountIdQuery(whatsappAccountId),
      isActive: true,
    };
  }

  private activeTagCountFilter(whatsappAccountId: string, account: any) {
    if (account?.tenantId) {
      return {
        isActive: true,
        $or: [
          { tenantId: account.tenantId },
          ...this.whatsappAccountIdQuery(whatsappAccountId).$or,
        ],
      };
    }
    return {
      ...this.whatsappAccountIdQuery(whatsappAccountId),
      isActive: true,
    };
  }

  private async ensureLegacyTags(whatsappAccountId: string) {
    const existing = await this.tagModel.countDocuments(this.whatsappAccountIdQuery(whatsappAccountId));
    if (existing > 0) return;
    const account = await this.clients.findOne(whatsappAccountId);
    const legacyTags = await this.model.distinct('tags', this.whatsappAccountIdQuery(whatsappAccountId));
    const clean = Array.from(new Map(
      legacyTags
        .map((tag) => this.cleanTagName(tag))
        .filter(Boolean)
        .map((name) => [this.normalizeTag(name), name]),
    ).values());

    if (!clean.length) return;
    await this.tagModel.insertMany(clean.map((name) => ({
      whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
      tenantId: account?.tenantId,
      name,
      normalizedName: this.normalizeTag(name),
    })), { ordered: false }).catch(() => undefined);
  }

  private renameTagOnContacts(whatsappAccountId: string, oldName: string, newName: string) {
    return this.model.updateMany(
      { ...this.whatsappAccountIdQuery(whatsappAccountId), tags: oldName },
      [{
        $set: {
          tags: {
            $setUnion: [{
              $map: {
                input: '$tags',
                as: 'tag',
                in: { $cond: [{ $eq: ['$$tag', oldName] }, newName, '$$tag'] },
              },
            }, []],
          },
        },
      }],
    );
  }

  private renameTagOnSegments(whatsappAccountId: string, oldName: string, newName: string) {
    return this.segmentModel.updateMany(
      { ...this.whatsappAccountIdQuery(whatsappAccountId), tags: oldName },
      [{
        $set: {
          tags: {
            $setUnion: [{
              $map: {
                input: '$tags',
                as: 'tag',
                in: { $cond: [{ $eq: ['$$tag', oldName] }, newName, '$$tag'] },
              },
            }, []],
          },
        },
      }],
    );
  }
}
