import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template, TemplateDocument } from './template.schema';
import { MetaService } from '../common/meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name) private model: Model<TemplateDocument>,
    private meta: MetaService,
    private clients: WhatsAppAccountsService,
  ) {}

  findAll(clientId: string) {
    return this.model.find({ clientId: new Types.ObjectId(clientId) });
  }

  findByName(clientId: string, name: string) {
    return this.model.findOne({ clientId: new Types.ObjectId(clientId), name });
  }

  async sync(clientId: string) {
    const client = await this.clients.findOne(clientId);
    const metaTemplates = await this.meta.getTemplates(client.wabaId, client.accessToken);
    const ops = metaTemplates.map((t: any) => ({
      updateOne: {
        filter: { clientId: new Types.ObjectId(clientId), name: t.name },
        update: {
          $set: {
            clientId: new Types.ObjectId(clientId),
            tenantId: client.tenantId,
            name: t.name, category: t.category, language: t.language, status: t.status, components: t.components, rawMeta: t,
          },
        },
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops);
    return this.findAll(clientId);
  }
}
