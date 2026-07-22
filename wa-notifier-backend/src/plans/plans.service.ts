import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan, PlanDocument, PlanStatus } from './plan.schema';
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
      .find({ status: PlanStatus.ACTIVE, showOnWebsite: true })
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
    if (dto.billingCycle !== 'on_request' && (dto.price === undefined || dto.price === null)) {
      throw new BadRequestException('price is required unless billingCycle is on_request');
    }
    const count = await this.planModel.countDocuments();
    return this.planModel.create({ ...dto, displayOrder: dto.displayOrder ?? count });
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findByIdAndUpdate(id, dto, { new: true });
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
}
