require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const users = mongoose.connection.collection('users');
    const flag = await users.updateMany({ twoFactorEnabled: { $exists: false } }, { $set: { twoFactorEnabled: false } });
    await users.updateMany({ securityVersion: { $exists: false } }, { $set: { securityVersion: 0 } });
    await users.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true, useSecondaryEmailForOtp: false } });
    const verification = mongoose.connection.collection('emailverifications');
    await verification.createIndex({ tokenHash: 1 }, { unique: true });
    await verification.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const challenges = mongoose.connection.collection('loginchallenges');
    await challenges.createIndex({ tokenHash: 1 }, { unique: true });
    await challenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await challenges.createIndex({ userId: 1 });
    console.log(`2FA defaults added to ${flag.modifiedCount} existing users. Challenge indexes ready.`);
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error('2FA migration failed. Check database access and configuration.'); process.exitCode = 1; });
