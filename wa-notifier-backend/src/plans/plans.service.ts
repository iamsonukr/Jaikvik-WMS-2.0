import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_MESSAGE_RATES, Plan, PlanDocument, PlanStatus } from './plan.schema';
import { CreatePlanDto, ReorderPlansDto, UpdatePlanDto } from './plan.dto';
import { Subscription, SubscriptionDocument } from '../subscriptions/subscription.schema';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  // Only what the public pricing page / client dashboard should ever see.
  async findPublic() {
    return this.planModel
      .find({ status: PlanStatus.ACTIVE })
      .sort({ displayOrder: 1 });
  }

  async findAll() {
    return this.planModel.find().sort({ displayOrder: 1 });
  }

  async findOne(id: string) {
    const plan = await this.planModel.findById(id);
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const count = await this.planModel.countDocuments();
    const status = dto.status ?? PlanStatus.ACTIVE;
    const payload = this.normalizeLimitFields({
      ...dto,
      status,
      showOnWebsite: status === PlanStatus.ACTIVE,
      features: this.cleanFeatures(dto.features),
      displayOrder: dto.displayOrder ?? count,
    });
    this.assertPurchasablePrice(payload);
    return this.planModel.create(payload);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const payload = this.normalizeLimitFields(dto.features ? { ...dto, features: this.cleanFeatures(dto.features) } : { ...dto });
    this.assertPurchasablePrice(payload);
    if (payload.status) payload.showOnWebsite = payload.status === PlanStatus.ACTIVE;
    const plan = await this.planModel.findByIdAndUpdate(id, payload, { new: true });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  // "Disable" — soft, reversible, keeps existing subscribers on the plan.
  async disable(id: string) {
    return this.update(id, { status: PlanStatus.INACTIVE });
  }

  // Hard delete only if no tenant has ever subscribed to it — otherwise
  // historical subscription/billing records would dangle.
  async remove(id: string) {
    const inUse = await this.subscriptionModel.exists({ planId: id });
    if (inUse) {
      throw new BadRequestException(
        'This plan has subscription history and cannot be deleted — disable it instead.',
      );
    }
    const result = await this.planModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Plan not found');
    return { message: 'Plan deleted' };
  }

  async reorder(dto: ReorderPlansDto) {
    await Promise.all(
      dto.orderedIds.map((id, index) => this.planModel.updateOne({ _id: id }, { displayOrder: index })),
    );
    return this.findAll();
  }

  private cleanFeatures(features?: string[]) {
    return Array.from(new Set((features || []).map((feature) => String(feature || '').trim()).filter(Boolean)));
  }

  private normalizeLimitFields<T extends CreatePlanDto | UpdatePlanDto>(dto: T): T {
    const payload: any = { ...dto };
    const limitKeys = ['contacts', 'teamMembers', 'whatsappNumbers', 'customFields', 'tags'];
    const limits = { ...(payload.limits || {}) };

    for (const key of limitKeys) {
      if (payload[key] === undefined && limits[key] !== undefined) {
        payload[key] = this.toOptionalNumber(limits[key]);
      }
      if (payload[key] !== undefined) {
        payload[key] = this.toOptionalNumber(payload[key]);
        limits[key] = payload[key];
      }
    }

    payload.limits = limits;
    if (payload.messageRates !== undefined) {
      payload.messageRates = this.normalizeMessageRates(payload.messageRates);
    }
    if (payload.price !== undefined) {
      payload.price = this.normalizePrice(payload.price);
    }
    return payload;
  }

  private toOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
  }

  private normalizeMessageRates(value: Record<string, any> = {}) {
    const rates = { ...DEFAULT_MESSAGE_RATES, ...(value || {}) };
    return Object.fromEntries(
      Object.keys(DEFAULT_MESSAGE_RATES).map((key) => {
        const numberValue = Number(rates[key]);
        return [key, Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0];
      }),
    );
  }

  private normalizePrice(value: any) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return { monthly: null, quarterly: value, yearly: null };
    return {
      monthly: this.toOptionalNumber(value.monthly),
      quarterly: this.toOptionalNumber(value.quarterly),
      yearly: this.toOptionalNumber(value.yearly),
    };
  }

  private assertPurchasablePrice(payload: any) {
    if (payload.price === undefined) return;
    const price = this.normalizePrice(payload.price);
    payload.price = price && Object.values(price).some((value) => value !== null && value !== undefined) ? price : null;
  }
}
