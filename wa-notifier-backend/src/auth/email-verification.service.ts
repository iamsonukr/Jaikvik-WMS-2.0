import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
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
  constructor(@InjectModel(EmailVerification.name) private model: Model<EmailVerificationDocument>, private config: ConfigService, private emailService: EmailService) {}
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private otpHash(tokenHash: string, otp: string) { return createHmac('sha256', this.config.get<string>('JWT_SECRET')).update(`email:${tokenHash}:${otp}`).digest('hex'); }
  async issue(purpose: 'signup' | 'secondary', email: string, ownerId?: string, securityVersion?: number, previous?: EmailVerificationDocument) {
    this.emailService.assertConfigured();
    email = email.trim().toLowerCase();
    const now = new Date();
    const token = randomBytes(32).toString('hex');
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
      if (error?.code === 11000) throw new HttpException('Please wait 60 seconds before requesting another code.', 429);
      throw error;
    }
    if (!reserved) throw new HttpException('Please wait 60 seconds before requesting another code.', 429);
    const otp = generateOtp();
    const otpExpiresAt = new Date(now.getTime() + 300000);
    await this.emailService.sendOtpEmail(email, otp, purpose === 'signup' ? 'account verification' : 'secondary email verification');
    const ready = await this.model.findOneAndUpdate({ _id: rateKey, tokenHash, consumed: false }, { $set: { otpHash: this.otpHash(tokenHash, otp), otpExpiresAt } });
    if (!ready) throw invalid();
    return { challengeToken: token, recipientLabel: maskEmail(email), resendAt: nextSendAt.toISOString(), otpExpiresAt: otpExpiresAt.toISOString() };
  }
  async resend(token: string, purpose: 'signup' | 'secondary', ownerId?: string, securityVersion?: number) {
    const previous = await this.model.findOne({ tokenHash: this.hash(token), purpose, consumed: false, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, ...(ownerId ? { ownerId, securityVersion } : {}) });
    if (!previous) throw invalid();
    return this.issue(purpose, previous.email, ownerId, securityVersion, previous);
  }
  async consume(token: string, otp: string, purpose: 'signup' | 'secondary', email?: string, ownerId?: string, securityVersion?: number) {
    const tokenHash = this.hash(token);
    const challenge = await this.model.findOneAndUpdate({ tokenHash, purpose, consumed: false, expiresAt: { $gt: new Date() }, otpExpiresAt: { $gt: new Date() }, otpHash: { $exists: true }, attempts: { $lt: 5 }, ...(email ? { email: email.trim().toLowerCase() } : {}), ...(ownerId ? { ownerId, securityVersion } : {}) }, { $inc: { attempts: 1 } }, { new: true });
    if (!challenge) throw invalid();
    const expected = Buffer.from(challenge.otpHash, 'hex');
    const actualHash = this.otpHash(tokenHash, otp);
    if (!timingSafeEqual(expected, Buffer.from(actualHash, 'hex'))) throw invalid();
    const consumed = await this.model.findOneAndUpdate({ _id: challenge._id, tokenHash, otpHash: actualHash, consumed: false, otpExpiresAt: { $gt: new Date() }, attempts: { $lte: 5 } }, { $set: { consumed: true }, $unset: { otpHash: 1 } });
    if (!consumed) throw invalid();
    return challenge.email;
  }
}
