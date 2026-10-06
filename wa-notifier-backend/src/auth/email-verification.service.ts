import { BadRequestException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EmailVerification, EmailVerificationDocument } from './email-verification.schema';
import { EmailService } from '../common/email.service';
import { generateOtp, maskEmail } from './two-factor.service';

const invalid = () => new BadRequestException('Email verification failed. Request a new code and try again.');
@Injectable()
export class EmailVerificationService {
  private logger = new Logger(EmailVerificationService.name);
  constructor(@InjectModel(EmailVerification.name) private model: Model<EmailVerificationDocument>, private config: ConfigService, private emailService: EmailService) {}
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private otpHash(tokenHash: string, otp: string) { return createHmac('sha256', this.config.get<string>('JWT_SECRET')).update(`email:${tokenHash}:${otp}`).digest('hex'); }
  async issue(purpose: 'signup' | 'secondary', email: string, ownerId?: string, securityVersion?: number, previous?: EmailVerificationDocument, previousToken?: string) {
    this.emailService.assertConfigured();
    email = email.trim().toLowerCase();
    const now = new Date();
    const token = previousToken || randomBytes(32).toString('hex');
    const tokenHash = this.hash(token);
    const rateKey = this.hash(`${purpose}:${ownerId || email}`);
    const filter: any = { _id: rateKey, $or: [{ nextSendAt: { $lte: now } }, { nextSendAt: { $exists: false } }] };
    if (previous) Object.assign(filter, { tokenHash: previous.tokenHash, consumed: false, attempts: { $lt: 5 }, expiresAt: { $gt: now } });
    const nextSendAt = new Date(now.getTime() + 60000);
    let reserved;
    try {
      reserved = await this.model.findOneAndUpdate(filter, {
        $set: { purpose, email, ownerId, securityVersion, tokenHash, expiresAt: new Date(now.getTime() + 600000), nextSendAt, ...(!previous ? { attempts: 0 } : {}), consumed: false },
        $unset: { otpHash: 1, otpExpiresAt: 1 },
      }, { upsert: !previous, new: true });
    } catch (error) {
      if (error?.code === 11000) {
        // Only an existing, active reservation is a cooldown. Unrelated unique
        // index errors must not be reported as requests the user never made.
        const existing = await this.model.findOne({ _id: rateKey });
        if (existing?.nextSendAt > now) throw this.cooldown(existing.nextSendAt);
        this.logger.error('Email verification reservation failed due to a database index conflict.');
        throw new ServiceUnavailableException('Email verification is temporarily unavailable. Please contact support.');
      }
      throw error;
    }
    if (!reserved) {
      const existing = await this.model.findOne({ _id: rateKey });
      if (existing?.nextSendAt > now) throw this.cooldown(existing.nextSendAt);
      throw invalid();
    }
    const otp = generateOtp();
    const otpExpiresAt = new Date(now.getTime() + 300000);
    try {
      await this.emailService.sendOtpEmail(email, otp, purpose === 'signup' ? 'account verification' : 'secondary email verification');
    } catch (error) {
      // Failed delivery should not leave a user who received no code locked out.
      // The token predicate protects a newer reservation from being released.
      await this.model.updateOne({ _id: rateKey, tokenHash, nextSendAt }, { $set: { nextSendAt: new Date() } });
      throw error;
    }
    const ready = await this.model.findOneAndUpdate({ _id: rateKey, tokenHash, nextSendAt, consumed: false, expiresAt: { $gt: new Date() } }, { $set: { otpHash: this.otpHash(tokenHash, otp), otpExpiresAt } });
    if (!ready) throw invalid();
    return { challengeToken: token, recipientLabel: maskEmail(email), resendAt: nextSendAt.toISOString(), otpExpiresAt: otpExpiresAt.toISOString() };
  }
  private cooldown(retryAt: Date) {
    const seconds = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000));
    return new HttpException({ message: `Please wait ${seconds} seconds before requesting another code.`, retryAt: retryAt.toISOString() }, 429);
  }
  async resend(token: string, purpose: 'signup' | 'secondary', ownerId?: string, securityVersion?: number) {
    const previous = await this.model.findOne({ tokenHash: this.hash(token), purpose, consumed: false, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, ...(ownerId ? { ownerId, securityVersion } : {}) });
    if (!previous) throw invalid();
    return this.issue(purpose, previous.email, ownerId, securityVersion, previous, token);
  }
  async consume(token: string, otp: string, purpose: 'signup' | 'secondary', email?: string, ownerId?: string, securityVersion?: number) {
    const tokenHash = this.hash(token);
    const challenge = await this.model.findOneAndUpdate({ tokenHash, purpose, consumed: false, expiresAt: { $gt: new Date() }, otpExpiresAt: { $gt: new Date() }, otpHash: { $exists: true }, attempts: { $lt: 5 }, ...(email ? { email: email.trim().toLowerCase() } : {}), ...(ownerId ? { ownerId, securityVersion } : {}) }, { $inc: { attempts: 1 } }, { new: true });
    if (!challenge) throw invalid();
    const expected = Buffer.from(challenge.otpHash, 'hex');
    const actualHash = this.otpHash(tokenHash, otp);
    const actual = Buffer.from(actualHash, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
    const consumed = await this.model.findOneAndUpdate({ _id: challenge._id, tokenHash, otpHash: actualHash, consumed: false, otpExpiresAt: { $gt: new Date() }, attempts: { $lte: 5 } }, { $set: { consumed: true }, $unset: { otpHash: 1 } });
    if (!consumed) throw invalid();
    return challenge.email;
  }
}
