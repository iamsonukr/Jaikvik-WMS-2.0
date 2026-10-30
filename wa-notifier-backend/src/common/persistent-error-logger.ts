import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';
import { ErrorLogsService } from '../error-logs/error-logs.service';

@Injectable()
export class PersistentErrorLogger extends ConsoleLogger implements LoggerService {
  constructor(private readonly errorLogs: ErrorLogsService) {
    super();
  }

  error(message: any, ...optionalParams: any[]) {
    super.error(message, ...optionalParams);
    const stack = optionalParams.find((value) => typeof value === 'string' && value.includes('\n    at '));
    const context = optionalParams.find((value) => typeof value === 'string' && value !== stack);
    void this.errorLogs.record({
      message: this.toText(message),
      context,
      stack,
    });
  }

  private toText(value: any): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
}
