import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export const secretHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function normalizeHookUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException('Enter the Catch Hook URL from Webhooks by Zapier.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'hooks.zapier.com' || url.port || url.username || url.password || url.search || url.hash
    || !/^\/hooks\/(catch|catchraw)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
    throw new BadRequestException('Use an HTTPS hooks.zapier.com Catch Hook URL without query parameters.');
  }
  return url.toString();
}
export function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function safeCustomFields(fields: Record<string, any> = {}) {
  if (Object.keys(fields).length > 30 || Object.entries(fields).some(([key, value]) =>
    !/^[a-zA-Z0-9_]+$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)
    || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 2000)) {
    throw new BadRequestException('Use up to 30 custom fields with simple names and text, number or boolean values.');
  }
  return fields;
}
export function templateParameterCount(template: any) {
  if (!template || String(template.status).toUpperCase() !== 'APPROVED') throw new BadRequestException('Choose an approved template belonging to this WhatsApp account.');
  const components = template.components || [];
  const body = components.find(c => String(c.type).toUpperCase() === 'BODY')?.text || '';
  const tokens: string[] = body.match(/\{\{[^}]+\}\}/g) || [];
  if (tokens.some(token => !/^\{\{\d+\}\}$/.test(token)) || components.some(c =>
    String(c.type).toUpperCase() === 'HEADER' && (String(c.format).toUpperCase() !== 'TEXT' || /\{\{/.test(c.text || ''))
    || String(c.type).toUpperCase() === 'BUTTONS' && c.buttons?.some(b => /\{\{/.test(b.url || '') || b.type === 'COPY_CODE'))) {
    throw new BadRequestException('Zapier currently supports numbered body parameters and static text headers/buttons.');
  }
  return Math.max(0, ...tokens.map(token => Number(token.slice(2, -2))));
}
