import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './tenant.schema';
import { CreateTenantDto, UpdateTenantBillingDto, UpdateTenantDto } from './tenant.dto';

@Injectable()
export class TenantsService {
  constructor(@InjectModel(Tenant.name) private model: Model<TenantDocument>) {}

  findAll() { return this.model.find().sort({ createdAt: -1 }).populate('planId', 'name'); }
  findOne(id: string) { return this.model.findById(id).populate('planId', 'name'); }
  findBySlug(slug: string) { return this.model.findOne({ slug }); }

  private slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  async create(dto: CreateTenantDto) {
    let slug = this.slugify(dto.slug || dto.name);
    if (!slug) throw new BadRequestException('Could not derive a slug from the tenant name.');

    const existing = await this.model.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    return this.model.create({ ...dto, slug });
  }

  async update(id: string, dto: UpdateTenantDto) {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async findBillingProfile(id: string) {
    const doc = await this.model.findById(id).select(
      'name contactEmail billingEmail taxId addressLine1 addressLine2 city state country postalCode',
    );
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async updateBillingProfile(id: string, dto: UpdateTenantBillingDto) {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true }).select(
      'name contactEmail billingEmail taxId addressLine1 addressLine2 city state country postalCode',
    );
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async setStatus(id: string, status: string) {
    const doc = await this.model.findByIdAndUpdate(id, { status }, { new: true });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async remove(id: string) {
    const doc = await this.setStatus(id, 'disabled');
    return { deleted: true, tenant: doc };
  }

  // Never hard-delete: financial/message history must remain attributable.
  // Admin delete is a soft delete that disables the tenant.
}
