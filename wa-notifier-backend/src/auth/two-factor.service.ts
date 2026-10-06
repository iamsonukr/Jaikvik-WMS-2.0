import { BadRequestException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isEmail } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './user.schema';
import { LoginChallenge, LoginChallengeDocument } from './login-challenge.schema';
import { EmailService } from '../common/email.service';
import { normalizeUserRole, UserRole } from '../common/enums/role.enum';
import { toObjectId } from '../common/mongo-id';

export const generateOtp = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const maskEmail = (email: string) => `${email[0]}***@${email.split('@')[1]}`;
const invalid = () => new UnauthorizedException('Verification failed. Please try again or sign in again.');

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    @InjectModel(LoginChallenge.name) private challenges: Model<LoginChallengeDocument>,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private credentials(user: UserDocument) {
    return this.hash(JSON.stringify([user.password, user.email, user.role, user.twoFactorEnabled, user.securityVersion || 0]));
  }
  private otpHash(tokenHash: string, otp: string) {
    return createHmac('sha256', this.config.get<string>('JWT_SECRET')).update(`${tokenHash}:${otp}`).digest('hex');
  }
  adminRecipients() {
    const entries = (this.config.get<string>('ADMIN_OTP_EMAILS') || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!entries.length || entries.some((value) => !isEmail(value))) {
      throw new BadRequestException('Admin email verification is not configured. Please contact support.');
    }
    return [...new Set(entries)];
  }
  async begin(user: UserDocument) {
    this.email.assertConfigured();
    const admin = normalizeUserRole(user.role) === UserRole.ADMIN;
    const recipients = admin ? this.adminRecipients() : [];
    const token = randomBytes(32).toString('hex');
    await this.challenges.create({ tokenHash: this.hash(token), userId: user._id, credentialHash: this.credentials(user), expiresAt: new Date(Date.now() + 10 * 60000) });
    const result = { twoFactorRequired: true, challengeToken: token, recipientOptions: recipients.map((email, index) => ({ id: String(index), label: maskEmail(email) })), requiresRecipientSelection: admin };
    if (!admin) {
      try { return { ...result, ...await this.send(token) }; }
      catch (error) { await this.challenges.deleteOne({ tokenHash: this.hash(token) }); throw error; }
    }
    return result;
  }
  private async lookup(token: string) {
    const challenge = await this.challenges.findOne({ tokenHash: this.hash(token), expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } });
    if (!challenge) throw invalid();
    const user = await this.users.findById(challenge.userId);
    if (!user || !user.isActive || !user.twoFactorEnabled || challenge.credentialHash !== this.credentials(user)) throw invalid();
    return { challenge, user };
  }
  async send(token: string, recipientId?: string) {
    const { challenge, user } = await this.lookup(token);
    let recipient = user.email;
    if (normalizeUserRole(user.role) === UserRole.ADMIN) {
      const recipients = this.adminRecipients();
      if (recipientId == null && challenge.recipient) recipient = challenge.recipient;
      else if (recipientId != null && /^(0|[1-9]\d*)$/.test(recipientId)) recipient = recipients[Number(recipientId)];
      else throw invalid();
      if (!recipient || !recipients.includes(recipient)) throw invalid();
    } else if (recipientId != null) throw invalid();
    const now = new Date();
    const next = new Date(now.getTime() + 60000);
    const reserved = await this.users.findOneAndUpdate({ _id: user._id, $or: [{ otpNextSendAt: { $exists: false } }, { otpNextSendAt: { $lte: now } }] }, { $set: { otpNextSendAt: next } });
    if (!reserved) throw new HttpException('Please wait 60 seconds before requesting another code.', 429);
    const otp = generateOtp();
    const otpHash = this.otpHash(challenge.tokenHash, otp);
    const otpExpiresAt = new Date(now.getTime() + 5 * 60000);
    const updated = await this.challenges.findOneAndUpdate({ _id: challenge._id, expiresAt: { $gt: now }, attempts: { $lt: 5 } }, { $set: { recipient }, $unset: { otpHash: 1, otpExpiresAt: 1 } });
    if (!updated) throw invalid();
    await this.email.sendOtpEmail(recipient, otp);
    const ready = await this.challenges.findOneAndUpdate({ _id: challenge._id, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $set: { otpHash, otpExpiresAt } });
    if (!ready) throw invalid();
    return { sent: true, recipientLabel: maskEmail(recipient), resendAt: next.toISOString(), otpExpiresAt: otpExpiresAt.toISOString() };
  }
  async verify(token: string, otp: string) {
    const { challenge, user } = await this.lookup(token);
    const reserved = await this.challenges.findOneAndUpdate({ _id: challenge._id, otpHash: { $exists: true }, otpExpiresAt: { $gt: new Date() }, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true });
    if (!reserved) throw invalid();
    const expected = Buffer.from(reserved.otpHash, 'hex');
    const actualHash = this.otpHash(challenge.tokenHash, otp);
    const actual = Buffer.from(actualHash, 'hex');
    if (!timingSafeEqual(expected, actual)) {
      if (reserved.attempts >= 5) await this.challenges.deleteOne({ _id: challenge._id });
      throw invalid();
    }
    const consumed = await this.challenges.findOneAndDelete({ _id: challenge._id, otpHash: actualHash, otpExpiresAt: { $gt: new Date() }, expiresAt: { $gt: new Date() }, attempts: { $lte: 5 } });
    if (!consumed) throw invalid();
    return user;
  }
  async confirmPassword(userId: string, password: string) {
    const user = await this.users.findById(toObjectId(userId, 'userId'));
    if (!user || !user.isActive) throw invalid();
    const now = new Date();
    await this.users.updateOne({ _id: user._id, $or: [{ securityPasswordWindow: { $exists: false } }, { securityPasswordWindow: { $lte: now } }] }, { $set: { securityPasswordAttempts: 0, securityPasswordWindow: new Date(now.getTime() + 15 * 60000) } });
    const allowed = await this.users.findOneAndUpdate({ _id: user._id, securityPasswordAttempts: { $lt: 5 } }, { $inc: { securityPasswordAttempts: 1 } });
    if (!allowed) throw new HttpException('Too many attempts. Please try again in 15 minutes.', 429);
    if (!await bcrypt.compare(password, user.password)) throw new BadRequestException('Unable to confirm your password.');
    await this.users.updateOne({ _id: user._id }, { $set: { securityPasswordAttempts: 0 } });
    return user;
  }
  async setEnabled(actorId: string, targetId: string, enabled: boolean | undefined, password: string) {
    const actor = await this.confirmPassword(actorId, password);
    if (String(actor._id) !== String(targetId) && normalizeUserRole(actor.role) !== UserRole.ADMIN) throw invalid();
    const target = await this.users.findById(toObjectId(targetId, 'userId'));
    if (!target) throw invalid();
    if (enabled === true) {
      this.email.assertConfigured();
      if (normalizeUserRole(target.role) === UserRole.ADMIN) this.adminRecipients();
    }
    const updated = await this.users.findByIdAndUpdate(target._id, { ...(enabled == null ? {} : { $set: { twoFactorEnabled: enabled } }), $inc: { securityVersion: 1 } }, { new: true }).select('-password');
    await this.challenges.deleteMany({ userId: target._id });
    return updated;
  }
}
