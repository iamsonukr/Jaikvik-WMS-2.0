const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { TwoFactorService, generateOtp } = require('../dist/auth/two-factor.service');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtStrategy } = require('../dist/auth/jwt.strategy');
const { EmailService, OTP_APP_NAME } = require('../dist/common/email.service');
const { Resend } = require('resend');
const { UserSchema } = require('../dist/auth/user.schema');
const { LoginChallengeSchema } = require('../dist/auth/login-challenge.schema');

const id = '507f1f77bcf86cd799439011';
const adminId = '507f1f77bcf86cd799439012';
const password = 'correct-password';
const passwordHash = bcrypt.hashSync(password, 4);
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((part) => matches(row, part));
    const actual = row[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && Object.keys(expected).some((key) => key.startsWith('$'))) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$gt') return actual > value;
        if (operator === '$lt') return actual < value;
        if (operator === '$lte') return actual <= value;
        throw new Error(`Unsupported test operator ${operator}`);
      });
    }
    return String(actual) === String(expected);
  });
}
function repository(initial = []) {
  const rows = initial.map((row) => ({ ...row }));
  const copy = (row) => row && ({ ...row, toObject() { const { toObject, save, ...data } = this; return data; }, async save() { Object.assign(rows.find((item) => item._id === this._id), this.toObject()); } });
  const query = (row) => {
    const promise = Promise.resolve(copy(row));
    promise.select = (fields) => {
      const result = copy(row);
      if (result && fields.includes('-password')) delete result.password;
      return Promise.resolve(result);
    };
    return promise;
  };
  const update = (row, changes) => {
    Object.assign(row, changes.$set || {});
    for (const key of Object.keys(changes.$unset || {})) delete row[key];
    for (const [key, value] of Object.entries(changes.$inc || {})) row[key] = (row[key] || 0) + value;
  };
  return {
    rows,
    async create(data) { const row = { attempts: 0, ...data, _id: String(rows.length + 1) }; rows.push(row); return copy(row); },
    findById(value) { return query(rows.find((row) => String(row._id) === String(value))); },
    findOne(filter) { return query(rows.find((row) => matches(row, filter))); },
    findOneAndUpdate(filter, changes, options = {}) {
      const row = rows.find((row) => matches(row, filter));
      if (!row) return query(null);
      const old = { ...row }; update(row, changes);
      return query(options.new ? row : old);
    },
    findByIdAndUpdate(value, changes, options) { return this.findOneAndUpdate({ _id: value }, changes, options); },
    async updateOne(filter, changes) { const row = rows.find((row) => matches(row, filter)); if (row) update(row, changes); },
    async deleteOne(filter) { const index = rows.findIndex((row) => matches(row, filter)); if (index >= 0) rows.splice(index, 1); },
    async deleteMany(filter) { for (let index = rows.length - 1; index >= 0; index--) if (matches(rows[index], filter)) rows.splice(index, 1); },
    async findOneAndDelete(filter) { const row = rows.find((row) => matches(row, filter)); if (!row) return null; await this.deleteOne(filter); return copy(row); },
  };
}
function fixture(role = 'master', configValues = {}) {
  const users = repository([{ _id: id, email: 'member@example.com', password: passwordHash, role, isActive: true, twoFactorEnabled: true, securityVersion: 0 }]);
  const challenges = repository();
  const config = { get(key) { return ({ JWT_SECRET: 'test-only-signing-secret', ADMIN_OTP_EMAILS: ' a@example.com, b@example.com ,a@example.com', RESEND_API_KEY: 'test-only', RESEND_FROM_EMAIL: 'security@example.com', ...configValues })[key]; } };
  const delivered = [];
  const email = { assertConfigured() {}, async sendOtpEmail(to, otp) { delivered.push({ to, otp }); } };
  const service = new TwoFactorService(users, challenges, config, email);
  return { service, users, challenges, delivered, email, config };
}
const rejected = (status) => (error) => error.getStatus() === status;

test('secure generation produces six-digit codes including leading zero format', () => {
  const codes = Array.from({ length: 1000 }, generateOtp);
  assert.ok(codes.every((code) => /^\d{6}$/.test(code)));
  assert.ok(new Set(codes).size > 900);
});

test('codes and challenge tokens are hashed, expire in five/ten minutes, and are single use', async () => {
  const { service, users, challenges, delivered } = fixture();
  const before = Date.now();
  const started = await service.begin(await users.findById(id));
  assert.equal(started.access_token, undefined);
  assert.equal(delivered[0].to, 'member@example.com');
  const challenge = challenges.rows[0];
  assert.notEqual(challenge.tokenHash, started.challengeToken);
  assert.notEqual(challenge.otpHash, delivered[0].otp);
  assert.equal(challenge.otpHash.length, 64);
  assert.ok(challenge.otpExpiresAt.getTime() >= before + 300000);
  assert.ok(challenge.expiresAt.getTime() >= before + 600000);
  assert.equal((await service.verify(started.challengeToken, delivered[0].otp))._id, id);
  await assert.rejects(() => service.verify(started.challengeToken, delivered[0].otp), rejected(401));
});

test('five wrong attempts invalidate OTP; resending cannot reset the attempt budget', async () => {
  const { service, users, challenges, delivered } = fixture();
  const { challengeToken } = await service.begin(await users.findById(id));
  const wrong = delivered[0].otp === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 4; attempt++) await assert.rejects(() => service.verify(challengeToken, wrong), rejected(401));
  users.rows[0].otpNextSendAt = new Date(0);
  await service.send(challengeToken);
  assert.equal(challenges.rows[0].attempts, 4);
  await assert.rejects(() => service.verify(challengeToken, wrong === delivered[1].otp ? '222222' : wrong), rejected(401));
  assert.equal(challenges.rows.length, 0);
  await assert.rejects(() => service.send(challengeToken), rejected(401));
});

test('expired OTP and expired challenge cannot grant a session', async () => {
  const { service, users, challenges, delivered } = fixture();
  const started = await service.begin(await users.findById(id));
  challenges.rows[0].otpExpiresAt = new Date(0);
  await assert.rejects(() => service.verify(started.challengeToken, delivered[0].otp), rejected(401));
  challenges.rows[0].expiresAt = new Date(0);
  await assert.rejects(() => service.send(started.challengeToken), rejected(401));
});

test('atomic account cooldown blocks resends, fresh-login bypasses and concurrent sends', async () => {
  const { service, users, delivered } = fixture();
  const started = await service.begin(await users.findById(id));
  await assert.rejects(() => service.send(started.challengeToken), rejected(429));
  await assert.rejects(() => service.begin(users.rows[0]), rejected(429));
  users.rows[0].otpNextSendAt = new Date(0);
  const result = await Promise.allSettled([service.send(started.challengeToken), service.send(started.challengeToken)]);
  assert.equal(result.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(delivered.length, 2);
});

test('admin sees masked options after credentials and can only select an env recipient', async () => {
  const { service, users, delivered } = fixture('admin');
  const started = await service.begin(await users.findById(id));
  assert.equal(delivered.length, 0);
  assert.deepEqual(started.recipientOptions, [{ id: '0', label: 'a***@example.com' }, { id: '1', label: 'b***@example.com' }]);
  for (const selection of ['attacker@example.com', '-1', '999', '01']) await assert.rejects(() => service.send(started.challengeToken, selection), rejected(401));
  await service.send(started.challengeToken, '1');
  assert.equal(delivered[0].to, 'b@example.com');
  const bad = fixture('admin', { ADMIN_OTP_EMAILS: 'not-an-email' });
  await assert.rejects(() => bad.service.begin(bad.users.rows[0]), rejected(400));
  const empty = fixture('admin', { ADMIN_OTP_EMAILS: '' });
  await assert.rejects(() => empty.service.begin(empty.users.rows[0]), rejected(400));
});

test('non-admin recipient overrides are rejected and codes route to registered email', async () => {
  for (const role of ['master', 'client_owner', 'client_user']) {
    const { service, users, delivered } = fixture(role);
    const started = await service.begin(await users.findById(id));
    assert.deepEqual(started.recipientOptions, []);
    assert.equal(delivered[0].to, users.rows[0].email);
    await assert.rejects(() => service.send(started.challengeToken, '0'), rejected(401));
  }
});

test('password-confirmed enable/disable invalidates codes and sessions; wrong password makes no change', async () => {
  const { service, users, challenges } = fixture();
  await service.begin(await users.findById(id));
  await assert.rejects(() => service.setEnabled(id, id, false, 'wrong'), rejected(400));
  assert.equal(users.rows[0].twoFactorEnabled, true);
  await service.setEnabled(id, id, false, password);
  assert.equal(users.rows[0].twoFactorEnabled, false);
  assert.equal(users.rows[0].securityVersion, 1);
  assert.equal(challenges.rows.length, 0);
  await service.setEnabled(id, id, true, password);
  assert.equal(users.rows[0].twoFactorEnabled, true);
  assert.equal(users.rows[0].securityVersion, 2);
});

test('admin management requires admin password; reset preserves enabled flag', async () => {
  const { service, users } = fixture('client_user');
  users.rows.push({ ...users.rows[0], _id: adminId, role: 'admin' });
  await assert.rejects(() => service.setEnabled(id, adminId, false, password), rejected(401));
  await assert.rejects(() => service.setEnabled(adminId, id, false, 'wrong'), rejected(400));
  await service.setEnabled(adminId, id, undefined, password);
  assert.equal(users.rows[0].twoFactorEnabled, true);
  assert.equal(users.rows[0].securityVersion, 1);
  await service.setEnabled(adminId, id, false, password);
  assert.equal(users.rows[0].twoFactorEnabled, false);
});

test('password confirmation blocks after five failed tries', async () => {
  const { service } = fixture();
  for (let i = 0; i < 5; i++) await assert.rejects(() => service.confirmPassword(id, 'wrong'), rejected(400));
  await assert.rejects(() => service.confirmPassword(id, password), rejected(429));
});

test('provider failure grants no session, clears pending hash and keeps resend cooldown', async () => {
  const { service, users, challenges, email } = fixture();
  email.sendOtpEmail = async () => { throw new Error('delivery unavailable'); };
  await assert.rejects(() => service.begin(users.rows[0]), /delivery unavailable/);
  assert.equal(challenges.rows.length, 0);
  assert.ok(users.rows[0].otpNextSendAt > new Date());
});

test('credential/security changes invalidate pending challenges', async () => {
  for (const changes of [{ email: 'changed@example.com' }, { password: 'changed-hash' }, { securityVersion: 1 }, { isActive: false }, { twoFactorEnabled: false }, { role: 'admin' }]) {
    const { service, users, delivered } = fixture();
    const started = await service.begin(await users.findById(id));
    Object.assign(users.rows[0], changes);
    await assert.rejects(() => service.verify(started.challengeToken, delivered[0].otp), rejected(401));
  }
});

test('login issues JWT only after OTP verification; disabled 2FA preserves ordinary login', async () => {
  for (const role of ['admin', 'master', 'client_owner', 'client_user']) {
    const { service, users, delivered } = fixture(role);
    let sessions = 0;
    const auth = new AuthService(users, { sign() { sessions++; return 'session-jwt'; } }, { async findOne() { return { status: 'active' }; } }, {}, service);
    users.rows[0].tenantId = 'tenant-id';
    const started = await auth.login({ email: users.rows[0].email, password });
    assert.equal(sessions, 0);
    if (role === 'admin') await service.send(started.challengeToken, '0');
    const session = await auth.verifyOtp({ challengeToken: started.challengeToken, otp: delivered[0].otp });
    assert.equal(session.access_token, 'session-jwt');
    assert.equal(session.user.role, role);
    assert.equal(sessions, 1);
    users.rows[0].twoFactorEnabled = false;
    const plain = await auth.login({ email: users.rows[0].email, password });
    assert.equal(plain.access_token, 'session-jwt');
    assert.equal(sessions, 2);
  }
});

test('login uses same generic error for nonexistent, wrong password and disabled account', async () => {
  const { service, users } = fixture();
  const auth = new AuthService(users, {}, {}, {}, service);
  for (const dto of [{ email: 'unknown@example.com', password }, { email: users.rows[0].email, password: 'wrong' }]) {
    await assert.rejects(() => auth.login(dto), (error) => error.message === 'Invalid credentials');
  }
  users.rows[0].isActive = false;
  await assert.rejects(() => auth.login({ email: users.rows[0].email, password }), (error) => error.message === 'Invalid credentials');
});

test('session version invalidation rejects legacy/stale JWT and allows current JWT', async () => {
  const { users } = fixture();
  users.rows[0].securityVersion = 2;
  const strategy = new JwtStrategy({ get() { return 'test-only-signing-secret'; } }, users, {});
  await assert.rejects(() => strategy.validate({ sub: id }), rejected(401));
  await assert.rejects(() => strategy.validate({ sub: id, securityVersion: 1 }), rejected(401));
  assert.equal((await strategy.validate({ sub: id, securityVersion: 2 }))._id, id);
});

test('schema defaults are opt-in; challenge TTL index exists', () => {
  assert.equal(UserSchema.path('twoFactorEnabled').defaultValue, false);
  assert.ok(LoginChallengeSchema.indexes().some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test('concurrent successful OTP requests issue at most one successful verification', async () => {
  const { service, users, delivered } = fixture();
  const started = await service.begin(await users.findById(id));
  const results = await Promise.allSettled([service.verify(started.challengeToken, delivered[0].otp), service.verify(started.challengeToken, delivered[0].otp)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('changing a protected verification email requires current password', async () => {
  const { service, users } = fixture();
  const auth = new AuthService(users, { sign() { return 'new-session'; } }, {}, {}, service);
  await assert.rejects(() => auth.updateProfile(id, { email: 'attacker@example.com' }), rejected(400));
  assert.equal(users.rows[0].email, 'member@example.com');
  const updated = await auth.updateProfile(id, { email: 'new@example.com', currentPassword: password });
  assert.equal(updated.email, 'new@example.com');
  assert.equal(updated.access_token, 'new-session');
  assert.equal(updated.password, undefined);
});

test('Resend rejects are safe user-facing errors and logs exclude OTP/provider details', async (t) => {
  const { config } = fixture();
  t.mock.method(Resend.prototype, 'fetchRequest', async () => ({ error: { message: 'secret-provider-detail' } }));
  const email = new EmailService(config);
  const logs = [];
  t.mock.method(email.logger, 'error', (message) => logs.push(message));
  await assert.rejects(() => email.sendOtpEmail('recipient@example.com', '012345'), (error) => error.getStatus() === 503 && !error.message.includes('secret-provider-detail'));
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes('012345'));
  assert.ok(!logs[0].includes('recipient@example.com'));
  assert.ok(!logs[0].includes('secret-provider-detail'));
});

test('Resend template has exact software name, HTML/text, six-digit code and expiry note', async (t) => {
  const { config } = fixture();
  let sent;
  t.mock.method(Resend.prototype, 'fetchRequest', async (path, options) => { sent = JSON.parse(options.body); return { data: { id: 'test-message' }, error: null }; });
  const email = new EmailService(config);
  await email.sendOtpEmail('recipient@example.com', '012345');
  assert.ok(sent.subject.includes(OTP_APP_NAME));
  assert.ok(sent.from.startsWith(OTP_APP_NAME));
  for (const body of [sent.html, sent.text]) {
    assert.ok(body.includes(OTP_APP_NAME)); assert.ok(body.includes('012345'));
    assert.ok(body.includes('5 minutes')); assert.ok(body.includes("wasn't you"));
  }
});
