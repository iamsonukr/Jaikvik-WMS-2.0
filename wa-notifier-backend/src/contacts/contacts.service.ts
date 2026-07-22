import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from './contact.schema';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

@Injectable()
export class ContactsService {
  constructor(
    @InjectModel(Contact.name) private model: Model<ContactDocument>,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(clientId: string, tag?: string) {
    const q: any = { clientId: this.clientIdQuery(clientId), isActive: true };
    if (tag) q.tags = tag;
    return this.model.find(q);
  }

  findByIds(ids: Types.ObjectId[]) { return this.model.find({ _id: { $in: ids } }); }

  async create(dto: Omit<Partial<Contact>, 'clientId'> & { clientId: string }) {
    const client = await this.clients.findOne(dto.clientId);
    return this.model.create({
      ...dto,
      clientId: this.toObjectId(dto.clientId),
      tenantId: client?.tenantId,
      phone: String(dto.phone || '').trim(),
    });
  }

  async bulkUpsert(clientId: string, contacts: Partial<Contact>[]) {
    const client = await this.clients.findOne(clientId);
    const valid = contacts
      .filter(c => c.phone && String(c.phone).trim().length > 0)
      .map(c => ({ ...c, phone: String(c.phone).trim() }));

    if (valid.length === 0) return { upsertedCount: 0, modifiedCount: 0, skipped: contacts.length };

    const ops = valid.map(c => ({
      updateOne: {
        filter: { clientId: this.toObjectId(clientId), phone: c.phone },
        update: { $set: { ...c, clientId: this.toObjectId(clientId), tenantId: client?.tenantId } },
        upsert: true,
      },
    }));
    const result = await this.model.bulkWrite(ops);
    return { ...result, skipped: contacts.length - valid.length };
  }

  update(id: string, dto: Partial<Contact>) {
    return this.model.findByIdAndUpdate(id, dto, { new: true });
  }

  remove(id: string) { return this.model.findByIdAndDelete(id); }

  getTags(clientId: string) {
    return this.model.distinct('tags', { clientId: this.clientIdQuery(clientId) });
  }

  countBySegment(clientId: string, tags: string[]) {
    const q: any = { clientId: this.clientIdQuery(clientId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = { $in: tags };
    return this.model.countDocuments(q);
  }

  findBySegment(clientId: string, tags: string[]) {
    const q: any = { clientId: this.clientIdQuery(clientId), isOptedOut: false, isActive: true };
    if (tags?.length) q.tags = { $in: tags };
    return this.model.find(q);
  }

  private toObjectId(id: string) {
    return new Types.ObjectId(String(id));
  }

  private clientIdQuery(id: string) {
    return { $in: [this.toObjectId(id), String(id)] };
  }
}
