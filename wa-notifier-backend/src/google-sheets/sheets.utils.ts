import { BadRequestException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const phoneNumber = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return '';
  const phone = `+${raw.replace(/\D/g, '')}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : '';
};
export const consentGiven = (value: unknown) => /^(true|yes|1)$/i.test(String(value ?? '').trim());
export function dueTime(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const calendar = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day
    || Number(text.slice(11, 13)) > 23 || Number(text.slice(14, 16)) > 59) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export const tabRange = (title: string, range: string) => `'${title.replace(/'/g, "''")}'!${range}`;
export function columnName(index: number) {
  let name = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
export function readTable(values: any[][]) {
  const headers = (values[0] || []).map(v => String(v).trim());
  if (!headers.length || headers.some(v => !v) || new Set(headers).size !== headers.length || values.some(row => row.length > headers.length)) {
    throw new BadRequestException('Row 1 must contain unique, non-empty column names.');
  }
  if (headers.length > 100 || values.length > 5001) throw new BadRequestException('Use at most 100 columns and 5,000 data rows per sheet.');
  return { headers, rows: values.slice(1).map((cells, i) => ({ rowNumber: i + 2, cells,
    data: Object.fromEntries(headers.map((h, j) => [h, String(cells[j] ?? '').trim()])),
  })).filter(row => row.cells.some(v => String(v).trim())) };
}
export function encryptToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(v => v.toString('base64url')).join('.');
}
export function decryptToken(value: string, key: Buffer) {
  const [iv, tag, data] = value.split('.').map(v => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
