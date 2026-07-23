import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './audit-log.schema';
import { optionalObjectId, toObjectId } from '../common/mongo-id';

export interface AuditLogEntry {
  actorUserId: string | Types.ObjectId;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | Types.ObjectId;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogFilters {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  constructor(@InjectModel(AuditLog.name) private model: Model<AuditLogDocument>) {}

  // Fire-and-forget from the caller's perspective: audit logging must never
  // block or fail the primary action it's recording.
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.model.create({
        ...entry,
        actorUserId: toObjectId(entry.actorUserId, 'actorUserId'),
        targetId: optionalObjectId(entry.targetId, 'targetId'),
      });
    } catch (err) {
      console.error('AuditLogService.log failed:', err);
    }
  }

  async findAll(filters: AuditLogFilters = {}) {
    const query: Record<string, any> = {};
    if (filters.actorUserId) query.actorUserId = toObjectId(filters.actorUserId, 'actorUserId');
    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.targetId) query.targetId = toObjectId(filters.targetId, 'targetId');
    if (filters.action) query.action = filters.action;

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, filters.limit || 25);

    const [items, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.model.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }
}
