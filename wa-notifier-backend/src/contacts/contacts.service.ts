import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from './contact.schema';
import { ContactTag, ContactTagDocument } from './contact-tag.schema';
import { ContactImport, ContactImportDocument } from './contact-import.schema';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { resolveWhatsAppAccountId, toObjectId, whatsappAccountIdFilter } from '../common/mongo-id';

@Injectable()
export class ContactsService {
  constructor(
    @InjectModel(Contact.name) private model: Model<ContactDocument>,
    @InjectModel(ContactTag.name) private tagModel: Model<ContactTagDocument>,
    @InjectModel(ContactImport.name) private importModel: Model<ContactImportDocument>,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(whatsappAccountId: string, tag?: string) {
    const q: any = { ...this.whatsappAccountIdQuery(whatsappAccountId), isActive: true };
    if (tag) q.tags = tag;
    return this.model.find(q);
  }

  findByIds(ids: Types.ObjectId[]) { return this.model.find({ _id: { $in: ids } }); }

  async create(dto: Omit<Partial<Contact>, 'whatsappAccountId'> & { whatsappAccountId?: string; clientId?: string }) {
    const whatsappAccountId = String(resolveWhatsAppAccountId(dto));
    const account = await this.clients.findOne(whatsappAccountId);
    const tags = await this.allowedTags(whatsappAccountId, dto.tags || []);
    return this.model.create({
      ...dto,
      whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
      tenantId: account?.tenantId,
      phone: String(dto.phone || '').trim(),
      tags,
    });
  }

  async bulkUpsert(whatsappAccountId: string, contacts: Partial<Contact>[]) {
    const account = await this.clients.findOne(whatsappAccountId);
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const valid = contacts
      .filter(c => c.phone && String(c.phone).trim().length > 0)
      .map(c => ({ ...c, phone: String(c.phone).trim() }));
    const allowed = await this.allowedTagSet(whatsappAccountId);

    if (valid.length === 0) return { upsertedCount: 0, modifiedCount: 0, skipped: contacts.length };

    const ops = valid.map(c => ({
      updateOne: {
        filter: { whatsappAccountId: accountObjectId, phone: c.phone },
        update: { $set: { ...c, tags: this.filterAllowedTags(c.tags || [], allowed), whatsappAccountId: accountObjectId, tenantId: account?.tenantId } },
        upsert: true,
      },
    }));
    const result = await this.model.bulkWrite(ops);
    return { ...result, skipped: contacts.length - valid.length };
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
    const allowed = await this.allowedTagSet(whatsappAccountId);
    const updateExisting = metadata.updateExisting !== false;
    const importable = analysis.rows.filter((row) => row.status === 'new' || (row.status === 'existing' && updateExisting));

    const ops = importable.map((row) => ({
      updateOne: {
        filter: { whatsappAccountId: accountObjectId, phone: row.phone },
        update: {
          $set: {
            phone: row.phone,
            name: row.name,
            tags: this.filterAllowedTags(row.tags || [], allowed),
            variables: row.variables || {},
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
      invalidReport: analysis.invalidReport.slice(0, 100),
      duplicateReport: analysis.duplicateReport.slice(0, 100),
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
    try {
      return await this.tagModel.create({
        whatsappAccountId: toObjectId(whatsappAccountId, 'whatsappAccountId'),
        tenantId: account?.tenantId,
        name,
        normalizedName: this.normalizeTag(name),
        color: dto.color || '#3b82f6',
        description: dto.description,
      });
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A tag with this name already exists for this WhatsApp account');
      throw err;
    }
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
    return this.tagModel.findByIdAndDelete(id);
  }

  countBySegment(whatsappAccountId: string, tags: string[]) {
    const q: any = { ...this.whatsappAccountIdQuery(whatsappAccountId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = { $in: tags };
    return this.model.countDocuments(q);
  }

  findBySegment(whatsappAccountId: string, tags: string[]) {
    const q: any = { ...this.whatsappAccountIdQuery(whatsappAccountId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = { $in: tags };
    return this.model.find(q);
  }

  private async analyzeImport(whatsappAccountId: string, contacts: Array<Partial<Contact> & { rowNumber?: number }>) {
    const accountObjectId = toObjectId(whatsappAccountId, 'whatsappAccountId');
    const prepared = contacts.map((contact, index) => {
      const rowNumber = Number(contact.rowNumber || index + 2);
      const phone = this.normalizePhone(contact.phone);
      const tags = Array.isArray(contact.tags) ? contact.tags.map((tag) => this.cleanTagName(tag)).filter(Boolean) : [];
      const variables = contact.variables && typeof contact.variables === 'object' ? contact.variables : {};
      return {
        rowNumber,
        phone,
        originalPhone: String(contact.phone || '').trim(),
        name: String(contact.name || '').trim(),
        tags,
        variables,
      };
    });

    const validPhoneSet = new Set(prepared.filter((row) => this.isValidPhone(row.phone)).map((row) => row.phone));
    const existing = validPhoneSet.size
      ? await this.model.find({ whatsappAccountId: accountObjectId, phone: { $in: Array.from(validPhoneSet) } }).select('phone name')
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
        const item = { rowNumber: row.rowNumber, phone: row.phone, reason: 'Contact already exists and will be updated' };
        duplicateReport.push(item);
        return { ...row, status: 'existing', reason: item.reason };
      }

      return { ...row, status: 'new', reason: 'Ready to import' };
    });

    const validRows = rows.filter((row) => row.status !== 'invalid').length;
    const importableRows = rows.filter((row) => row.status === 'new' || row.status === 'existing').length;
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
}
