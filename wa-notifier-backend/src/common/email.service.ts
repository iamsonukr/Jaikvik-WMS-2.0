import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { isEmail } from 'class-validator';

export const OTP_APP_NAME = 'Jaikvik Whatsapp Marketing System';

@Injectable()
export class EmailService {
  private logger = new Logger(EmailService.name);
  constructor(private config: ConfigService) {}

  assertConfigured() {
    if (!this.config.get<string>('RESEND_API_KEY') || !isEmail(this.config.get<string>('RESEND_FROM_EMAIL') || '')) {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable. Please contact support.');
    }
  }

  async sendOtpEmail(to: string, otp: string, purpose = 'sign-in') {
    this.assertConfigured();
    const text = `${OTP_APP_NAME}\n\nYour ${purpose} code is ${otp}. It expires in 5 minutes and can only be used once.\n\nDo not share this code. If this wasn't you, ignore this email.`;
    try {
      const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
      const { error } = await resend.emails.send({
        from: `${OTP_APP_NAME} <${this.config.get<string>('RESEND_FROM_EMAIL')}>`,
        to, subject: `${OTP_APP_NAME} - Your ${purpose} code`, text,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;color:#172033"><h2>${OTP_APP_NAME}</h2><p>Your ${purpose} code:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p><p>This code expires in <strong>5 minutes</strong> and can only be used once.</p><p>Do not share this code. If this wasn't you, ignore this email.</p></div>`,
      }, { signal: AbortSignal.timeout(15000) });
      if (error) throw new Error('provider rejected delivery');
    } catch {
      // Provider responses can contain addresses or credentials; never log them.
      this.logger.error('OTP email delivery failed. Check Resend configuration and provider status.');
      throw new ServiceUnavailableException('Could not send the verification email. Please try again shortly.');
    }
  }
}
