import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorLog, ErrorLogDocument } from './error-log.schema';

export interface ErrorLogEntry {
  message: string;
  context?: string;
  stack?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  level?: string;
}

@Injectable()
export class ErrorLogsService {
  constructor(@InjectModel(ErrorLog.name) private model: Model<ErrorLogDocument>) {}

  async record(entry: ErrorLogEntry) {
    try {
      await this.model.create({ ...entry, level: entry.level || 'error' });
    } catch (err) {
      console.error('Could not persist application error log:', err);
    }
  }

  async findAll(page = 1, limit = 25) {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(100, Math.max(1, limit || 25));
    const [items, total] = await Promise.all([
      this.model.find().sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
      this.model.countDocuments(),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }
}
