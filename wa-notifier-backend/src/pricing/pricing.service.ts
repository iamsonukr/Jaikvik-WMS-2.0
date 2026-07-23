import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessagePricing, MessagePricingDocument, MessageCategory, PricingScope } from './message-pricing.schema';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { CreateMessagePricingDto, UpdateMessagePricingDto } from './message-pricing.dto';
import { optionalObjectId, toObjectId } from '../common/mongo-id';

export interface ResolvedPrice {
  category: MessageCategory;
  country: string;
  sellingPrice: number;
  currency: string;
  taxPercent: number;
  scope: PricingScope;
  pricingId: string;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(MessagePricing.name) private model: Model<MessagePricingDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  async findAll() {
    return this.model.find().sort({ category: 1, country: 1, scope: 1 });
  }

  async findOne(id: string) {
    const row = await this.model.findById(id);
    if (!row) throw new NotFoundException('Pricing rule not found');
    return row;
  }

  async create(dto: CreateMessagePricingDto) {
    return this.model.create(this.normalizePricingRefs({ ...dto, country: dto.country || 'default' }));
  }

  async update(id: string, dto: UpdateMessagePricingDto) {
    const row = await this.model.findByIdAndUpdate(id, this.normalizePricingRefs(dto), { new: true });
    if (!row) throw new NotFoundException('Pricing rule not found');
    return row;
  }

  async remove(id: string) {
    const result = await this.model.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Pricing rule not found');
    return { message: 'Pricing rule deleted' };
  }

  /**
   * Resolves the price a tenant is actually charged for a message, applying
   * this priority order (first match wins):
   *   1. Client-specific price   (scope=client, tenantId matches)
   *   2. Plan-specific price     (scope=plan, planId matches the tenant's current plan)
   *   3. Country-specific price  (scope=country, country matches)
   *   4. Default price           (scope=default, country='default')
   *
   * This must be the ONLY place the platform decides a message's cost —
   * the frontend only ever displays what this returns, never computes it.
   */
  async resolvePrice(tenantId: string, category: MessageCategory, country: string): Promise<ResolvedPrice> {
    const tenantObjectId = toObjectId(tenantId, 'tenantId');
    const clientPrice = await this.model.findOne({
      category,
      scope: PricingScope.CLIENT,
      tenantId: tenantObjectId,
      isActive: true,
    });
    if (clientPrice) return this.toResolved(clientPrice);

    const tenant = await this.tenantModel.findById(tenantObjectId);
    if (tenant?.planId) {
      const planPrice = await this.model.findOne({
        category,
        scope: PricingScope.PLAN,
        planId: tenant.planId,
        isActive: true,
      });
      if (planPrice) return this.toResolved(planPrice);
    }

    const countryPrice = await this.model.findOne({
      category,
      scope: PricingScope.COUNTRY,
      country,
      isActive: true,
    });
    if (countryPrice) return this.toResolved(countryPrice);

    const defaultPrice = await this.model.findOne({
      category,
      scope: PricingScope.DEFAULT,
      country: 'default',
      isActive: true,
    });
    if (defaultPrice) return this.toResolved(defaultPrice);

    throw new NotFoundException(
      `No active pricing configured for category "${category}" (checked client/plan/country/default)`,
    );
  }

  private toResolved(row: MessagePricingDocument): ResolvedPrice {
    return {
      category: row.category,
      country: row.country,
      sellingPrice: row.sellingPrice,
      currency: row.currency,
      taxPercent: row.taxPercent,
      scope: row.scope,
      pricingId: String(row._id),
    };
  }

  private normalizePricingRefs<T extends CreateMessagePricingDto | UpdateMessagePricingDto>(dto: T): T {
    const normalized: Record<string, any> = { ...dto };
    if ('tenantId' in normalized) normalized.tenantId = optionalObjectId(normalized.tenantId, 'tenantId');
    if ('planId' in normalized) normalized.planId = optionalObjectId(normalized.planId, 'planId');
    return normalized as T;
  }
}
