import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');
const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'code',
  'client_secret',
  'hub.verify_token',
  'password',
  'secret',
  'token',
]);

function sanitizeUrl(originalUrl: string) {
  try {
    const parsed = new URL(originalUrl, 'http://localhost');
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return originalUrl;
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const url = sanitizeUrl(req.originalUrl || req.url);
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const message = `${req.method} ${url} ${res.statusCode} ${duration}ms${ip ? ` - ${ip}` : ''}`;

    if (res.statusCode >= 500) {
      logger.error(message);
    } else if (res.statusCode >= 400) {
      logger.warn(message);
    } else {
      logger.log(message);
    }
  });

  next();
}
