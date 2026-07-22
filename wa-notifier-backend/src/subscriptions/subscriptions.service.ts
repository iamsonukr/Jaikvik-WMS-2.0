import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from './subscription.schema';
import { Plan, PlanDocument } from '../plans/plan.schema';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import {
  AssignSubscriptionDto,
  ChangeSubscriptionPlanDto,
  ExtendSubscriptionDto,
} from './subscription.dto';

const CYCLE_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
  custom: 30,
  on_request: 365, // Enterprise — placeholder until a custom contract term is set manually
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    @InjectModel(Plan.name) private planModel: Model<PlanDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  async findAll() {
    return this.subModel.find().sort({ createdAt: -1 }).populate('planId').populate('tenantId');
  }

  async findByTenant(tenantId: string) {
    return this.subModel.find({ tenantId }).sort({ createdAt: -1 }).populate('planId');
  }

  async currentForTenant(tenantId: string) {
    return this.subModel
      .findOne({ tenantId, status: SubscriptionStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .populate('planId');
  }

  // Assigns a plan to a tenant — either their first subscription, or a fresh
  // one replacing whatever's currently active (the previous one is marked
  // cancelled rather than deleted, preserving billing history).
  async assign(dto: AssignSubscriptionDto) {
    const plan = await this.planModel.findById(dto.planId);
    if (!plan) throw new NotFoundException('Plan not found');

    const tenant = await this.tenantModel.findById(dto.tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.subModel.updateMany(
      { tenantId: dto.tenantId, status: SubscriptionStatus.ACTIVE },
      { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), cancelReason: 'Superseded by new plan assignment' },
    );

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = this.computeEndDate(startDate, plan.billingCycle);

    const subscription = await this.subModel.create({
      tenantId: dto.tenantId,
      planId: plan._id,
      startDate,
      endDate,
      status: SubscriptionStatus.ACTIVE,
      priceSnapshot: plan.price ?? 0,
      billingCycleSnapshot: plan.billingCycle,
      currency: plan.currency,
    });

    await this.syncTenant(tenant, subscription, plan);
    return subscription;
  }

  async changePlan(subscriptionId: string, dto: ChangeSubscriptionPlanDto) {
    const current = await this.subModel.findById(subscriptionId);
    if (!current) throw new NotFoundException('Subscription not found');
    return this.assign({ tenantId: String(current.tenantId), planId: dto.planId });
  }

  async extend(subscriptionId: string, dto: ExtendSubscriptionDto) {
    const subscription = await this.subModel.findById(subscriptionId);
    if (!subscription) throw new NotFoundException('Subscription not found');

    const newEndDate = new Date(dto.newEndDate);
    if (newEndDate <= subscription.endDate) {
      throw new BadRequestException('newEndDate must be after the current endDate');
    }
    subscription.endDate = newEndDate;
    if (subscription.status === SubscriptionStatus.EXPIRED) subscription.status = SubscriptionStatus.ACTIVE;
    await subscription.save();

    const tenant = await this.tenantModel.findById(subscription.tenantId);
    if (tenant && String(tenant.currentSubscriptionId) === String(subscription._id)) {
      tenant.subscriptionEndAt = newEndDate;
      await tenant.save();
    }
    return subscription;
  }

  async cancel(subscriptionId: string, reason?: string) {
    const subscription = await this.subModel.findById(subscriptionId);
    if (!subscription) throw new NotFoundException('Subscription not found');

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();
    subscription.cancelReason = reason;
    subscription.autoRenew = false;
    await subscription.save();
    return subscription;
  }

  async revoke(subscriptionId: string, reason?: string) {
    return this.cancel(subscriptionId, reason || 'Revoked by platform staff');
  }

  // Sweep for a scheduler/cron to call periodically — marks anything past its
  // endDate as expired without deleting anything.
  async expireOverdue() {
    const result = await this.subModel.updateMany(
      { status: SubscriptionStatus.ACTIVE, endDate: { $lt: new Date() } },
      { status: SubscriptionStatus.EXPIRED },
    );
    return { expired: result.modifiedCount };
  }

  private computeEndDate(startDate: Date, billingCycle: string): Date {
    const days = CYCLE_DAYS[billingCycle] ?? 30;
    const end = new Date(startDate);
    end.setDate(end.getDate() + days);
    return end;
  }

  private async syncTenant(tenant: TenantDocument, subscription: SubscriptionDocument, plan: PlanDocument) {
    tenant.planId = plan._id as any;
    tenant.currentSubscriptionId = subscription._id as any;
    tenant.subscriptionStartAt = subscription.startDate;
    tenant.subscriptionEndAt = subscription.endDate;
    await tenant.save();
  }
}
