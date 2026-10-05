import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export function calendlyUri(value: unknown, type: string) {
  if (typeof value !== 'string' || !new RegExp(`^https://api\\.calendly\\.com/${type}/[a-zA-Z0-9-]+$`).test(value)) {
    throw new BadRequestException('Invalid Calendly resource.');
  }
  return value;
}
export function verifySignature(raw: Buffer, header: unknown, key: string, now = Date.now()) {
  if (!Buffer.isBuffer(raw) || typeof header !== 'string') throw new UnauthorizedException('Missing Calendly signature.');
  const parts = header.split(',').map(part => part.trim().split('='));
  const timestamps = parts.filter(([name]) => name === 't');
  const timestamp = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 180) {
    throw new UnauthorizedException('Expired Calendly signature.');
  }
  const expected = createHmac('sha256', key).update(`${timestamp}.`).update(raw).digest();
  if (!parts.some(([name, value]) => name === 'v1' && /^[a-f0-9]{64}$/i.test(value || '') && timingSafeEqual(expected, Buffer.from(value, 'hex')))) {
    throw new UnauthorizedException('Invalid Calendly signature.');
  }
}
export function bookingFields(booking: any) {
  let timezone = booking.timezone || 'UTC';
  try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }); } catch { timezone = 'UTC'; }
  return { name: booking.name || 'Guest', event_name: booking.eventName || 'Appointment',
    start_time: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(booking.startTime)),
    timezone, location: booking.location || '', cancel_url: booking.cancelUrl || '', reschedule_url: booking.rescheduleUrl || '' };
}
