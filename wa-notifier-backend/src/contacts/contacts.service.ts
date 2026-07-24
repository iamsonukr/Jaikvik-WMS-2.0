import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from './contact.schema';
import { ContactTag, ContactTagDocument } from './contact-tag.schema';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { legacyObjectIdFilter, toObjectId } from '../common/mongo-id';

@Injectable()
export class ContactsService {
  constructor(
    @InjectModel(Contact.name) private model: Model<ContactDocument>,
    @InjectModel(ContactTag.name) private tagModel: Model<ContactTagDocument>,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(clientId: string, tag?: string) {
    const q: any = { ...this.clientIdQuery(clientId), isActive: true };
    if (tag) q.tags = tag;
    return this.model.find(q);
  }

  findByIds(ids: Types.ObjectId[]) { return this.model.find({ _id: { $in: ids } }); }

  async create(dto: Omit<Partial<Contact>, 'clientId'> & { clientId: string }) {
    const client = await this.clients.findOne(dto.clientId);
    const tags = await this.allowedTags(dto.clientId, dto.tags || []);
    return this.model.create({
      ...dto,
      clientId: toObjectId(dto.clientId, 'clientId'),
      tenantId: client?.tenantId,
      phone: String(dto.phone || '').trim(),
      tags,
    });
  }

  async bulkUpsert(clientId: string, contacts: Partial<Contact>[]) {
    const client = await this.clients.findOne(clientId);
    const clientObjectId = toObjectId(clientId, 'clientId');
    const valid = contacts
      .filter(c => c.phone && String(c.phone).trim().length > 0)
      .map(c => ({ ...c, phone: String(c.phone).trim() }));
    const allowed = await this.allowedTagSet(clientId);

    if (valid.length === 0) return { upsertedCount: 0, modifiedCount: 0, skipped: contacts.length };

    const ops = valid.map(c => ({
      updateOne: {
        filter: { clientId: clientObjectId, phone: c.phone },
        update: { $set: { ...c, tags: this.filterAllowedTags(c.tags || [], allowed), clientId: clientObjectId, tenantId: client?.tenantId } },
        upsert: true,
      },
    }));
    const result = await this.model.bulkWrite(ops);
    return { ...result, skipped: contacts.length - valid.length };
  }

  async update(id: string, dto: Partial<Contact>) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Contact not found');
    const next: Partial<Contact> = { ...dto };
    if (dto.tags) next.tags = await this.allowedTags(String(existing.clientId), dto.tags);
    return this.model.findByIdAndUpdate(id, next, { new: true });
  }

  remove(id: string) { return this.model.findByIdAndDelete(id); }

  async getTags(clientId: string) {
    await this.ensureLegacyTags(clientId);
    return this.tagModel.find({ ...this.clientIdQuery(clientId), isActive: true }).sort({ name: 1 });
  }

  async createTag(dto: { clientId: string; name: string; color?: string; description?: string }) {
    const client = await this.clients.findOne(dto.clientId);
    const name = this.cleanTagName(dto.name);
    if (!name) throw new BadRequestException('Tag name is required');
    try {
      return await this.tagModel.create({
        clientId: toObjectId(dto.clientId, 'clientId'),
        tenantId: client?.tenantId,
        name,
        normalizedName: this.normalizeTag(name),
        color: dto.color || '#3b82f6',
        description: dto.description,
      });
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A tag with this name already exists for this client');
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
        await this.renameTagOnContacts(String(existing.clientId), oldName, next.name);
      }
      return saved;
    } catch (err) {
      if (err?.code === 11000) throw new BadRequestException('A tag with this name already exists for this client');
      throw err;
    }
  }

  async removeTag(id: string) {
    const existing = await this.tagModel.findById(id);
    if (!existing) throw new NotFoundException('Tag not found');
    await this.model.updateMany(this.clientIdQuery(String(existing.clientId)), { $pull: { tags: existing.name } });
    return this.tagModel.findByIdAndDelete(id);
  }

  countBySegment(clientId: string, tags: string[]) {
    const q: any = { ...this.clientIdQuery(clientId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = { $in: tags };
    return this.model.countDocuments(q);
  }

  findBySegment(clientId: string, tags: string[]) {
    const q: any = { ...this.clientIdQuery(clientId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = { $in: tags };
    return this.model.find(q);
  }

  private clientIdQuery(id: string) {
    return legacyObjectIdFilter('clientId', id);
  }

  private cleanTagName(name?: string) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  }

  private normalizeTag(name?: string) {
    return this.cleanTagName(name).toLowerCase();
  }

  private async allowedTagSet(clientId: string) {
    await this.ensureLegacyTags(clientId);
    const tags = await this.tagModel.find({ ...this.clientIdQuery(clientId), isActive: true }).select('name normalizedName');
    return new Map(tags.map((tag) => [tag.normalizedName, tag.name]));
  }

  private filterAllowedTags(tags: string[], allowed: Map<string, string>) {
    const selected = tags
      .map((tag) => allowed.get(this.normalizeTag(tag)))
      .filter(Boolean) as string[];
    return Array.from(new Set(selected));
  }

  private async allowedTags(clientId: string, tags: string[]) {
    return this.filterAllowedTags(tags, await this.allowedTagSet(clientId));
  }

  private async ensureLegacyTags(clientId: string) {
    const existing = await this.tagModel.countDocuments(this.clientIdQuery(clientId));
    if (existing > 0) return;

    const client = await this.clients.findOne(clientId);
    const legacyTags = await this.model.distinct('tags', this.clientIdQuery(clientId));
    const clean = Array.from(new Map(
      legacyTags
        .map((tag) => this.cleanTagName(tag))
        .filter(Boolean)
        .map((name) => [this.normalizeTag(name), name]),
    ).values());

    if (!clean.length) return;
    await this.tagModel.insertMany(clean.map((name) => ({
      clientId: toObjectId(clientId, 'clientId'),
      tenantId: client?.tenantId,
      name,
      normalizedName: this.normalizeTag(name),
    })), { ordered: false }).catch(() => undefined);
  }

  private renameTagOnContacts(clientId: string, oldName: string, newName: string) {
    return this.model.updateMany(
      { ...this.clientIdQuery(clientId), tags: oldName },
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
