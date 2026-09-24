import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { randomBytes, createHash } from 'crypto';
import { Request, Response } from 'express';
import { SheetsConnection, SheetsOAuthState } from './sheets.schema';
import { decryptToken, encryptToken, hash } from './sheets.utils';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
@Injectable()
export class SheetsGoogleService {
  constructor(private cfg: ConfigService,
    @InjectModel(SheetsConnection.name) private connections: Model<SheetsConnection>,
    @InjectModel(SheetsOAuthState.name) private states: Model<SheetsOAuthState>) {}

  configured() {
    return ['GOOGLE_SHEETS_CLIENT_ID', 'GOOGLE_SHEETS_CLIENT_SECRET', 'GOOGLE_SHEETS_REDIRECT_URI', 'GOOGLE_SHEETS_FRONTEND_ORIGIN']
      .every(key => Boolean(this.cfg.get(key))) && /^[a-fA-F0-9]{64}$/.test(this.cfg.get('GOOGLE_SHEETS_ENCRYPTION_KEY') || '');
  }
  private key() {
    if (!this.configured()) throw new ServiceUnavailableException('Google Sheets is not configured on this server.');
    return Buffer.from(this.cfg.get<string>('GOOGLE_SHEETS_ENCRYPTION_KEY'), 'hex');
  }
  private redirect() { return this.cfg.get<string>('GOOGLE_SHEETS_REDIRECT_URI'); }
  private cookieName(state: string) { return `wms_sheets_${hash(state).slice(0, 16)}`; }
  private cookieOptions() {
    return { httpOnly: true, sameSite: 'lax' as const, secure: this.redirect().startsWith('https:'), path: new URL(this.redirect()).pathname, maxAge: 600000 };
  }
  async start(accountId: string, res: Response) {
    this.key();
    const state = randomBytes(32).toString('base64url');
    const browser = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    await this.states.create({ hash: hash(state), whatsappAccountId: accountId,
      browserHash: hash(browser), verifier, expiresAt: new Date(Date.now() + 600000) });
    await this.connections.findOneAndUpdate({ whatsappAccountId: accountId }, { $set: { oauthAttempt: hash(state) } }, { upsert: true });
    res.cookie(this.cookieName(state), browser, this.cookieOptions());
    const params = new URLSearchParams({ client_id: this.cfg.get('GOOGLE_SHEETS_CLIENT_ID'), redirect_uri: this.redirect(),
      response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    res.setHeader('Cache-Control', 'no-store');
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }
  async callback(req: Request, res: Response) {
    let success = false;
    const state = String(req.query.state || '');
    try {
      this.key();
      const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(this.cookieName(state) + '='))?.split('=')[1];
      if (!cookie) throw new Error('Missing browser binding');
      const pending = await this.states.findOneAndDelete({ hash: hash(state), browserHash: hash(cookie), expiresAt: { $gt: new Date() } });
      if (!pending || !req.query.code || req.query.error) throw new Error('Invalid callback');
      const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: this.cfg.get('GOOGLE_SHEETS_CLIENT_ID'), client_secret: this.cfg.get('GOOGLE_SHEETS_CLIENT_SECRET'),
        redirect_uri: this.redirect(), grant_type: 'authorization_code', code: String(req.query.code), code_verifier: pending.verifier,
      }), { timeout: 20000 });
      if (!data.refresh_token || !String(data.scope || '').split(' ').includes(SCOPE)) throw new Error('Missing Sheets access');
      // Never enable a previous automation merely by reconnecting an account.
      const saved = await this.connections.findOneAndUpdate({ whatsappAccountId: pending.whatsappAccountId, oauthAttempt: pending.hash }, { $set: {
        refreshToken: encryptToken(data.refresh_token, this.key()), connected: true, 'settings.enabled': false, lastError: '',
      }, $unset: { oauthAttempt: 1 }, $inc: { revision: 1 } });
      if (!saved) throw new Error('Connection attempt canceled or replaced');
      success = true;
    } catch { /* Do not expose OAuth tokens, codes, or upstream response bodies. */ }
    res.clearCookie(this.cookieName(state), this.cookieOptions());
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'none'; frame-ancestors 'none'`);
    const origin = JSON.stringify(this.cfg.get('GOOGLE_SHEETS_FRONTEND_ORIGIN') || '').replace(/</g, '\\u003c');
    res.type('html').send(`<!doctype html><html><head><title>Google Sheets connection</title></head><body><p>${success ? 'Google Sheets connected. Return to WMS.' : 'Google connection failed or was canceled. Return to WMS and try again.'}</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage({type:'wms-google-sheets',success:${success}},${origin});window.close();}</script></body></html>`);
  }
  async accessToken(accountId: string) {
    const connection = await this.connections.findOne({ whatsappAccountId: accountId, connected: true }).select('+refreshToken');
    if (!connection?.refreshToken) throw new BadRequestException('Connect Google Sheets first.');
    try {
      const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: this.cfg.get('GOOGLE_SHEETS_CLIENT_ID'), client_secret: this.cfg.get('GOOGLE_SHEETS_CLIENT_SECRET'),
        grant_type: 'refresh_token', refresh_token: decryptToken(connection.refreshToken, this.key()),
      }), { timeout: 20000 });
      return data.access_token as string;
    } catch (error) {
      if (error?.response?.data?.error === 'invalid_grant') {
        await this.connections.updateOne({ _id: connection._id }, { connected: false, 'settings.enabled': false, lastError: 'Google access expired or was revoked. Reconnect Google.' });
      }
      throw new BadRequestException('Cannot access Google. Reconnect Google or try again later.');
    }
  }
  async request(token: string, method: 'GET' | 'POST' | 'PUT', spreadsheetId: string, suffix = '', data?: any) {
    try {
      const response = await axios.request({ method, url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${suffix}`,
        headers: { Authorization: `Bearer ${token}` }, data, timeout: 20000, maxContentLength: 15 * 1024 * 1024 });
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      throw new BadRequestException(status === 403 ? 'Google denied access. Check spreadsheet permissions and whether the Sheets API is enabled.'
        : status === 404 ? 'Spreadsheet or tab not found.' : status === 429 ? 'Google Sheets quota reached. Try again later.' : 'Google Sheets request failed. Check the sheet and try again.');
    }
  }
  async disconnect(accountId: string) {
    // Locally remove this account's credentials. Google grants can be shared by
    // several WMS accounts, so do not revoke that grant for unrelated accounts.
    await this.connections.updateOne({ whatsappAccountId: accountId }, { $unset: { refreshToken: 1, oauthAttempt: 1 },
      $set: { connected: false, 'settings.enabled': false }, $inc: { revision: 1 } });
    await this.states.deleteMany({ whatsappAccountId: accountId });
    return { disconnected: true };
  }
}
