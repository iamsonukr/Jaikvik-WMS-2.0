#!/usr/bin/env node
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wa_notifier';

const RATE_TIERS = [
  { marketing: 0.970, authentication: 0.129, utility: 0.160, service: 0 },
  { marketing: 0.958, authentication: 0.128, utility: 0.150, service: 0 },
  { marketing: 0.949, authentication: 0.127, utility: 0.140, service: 0 },
];

function ratesForPlan(plan, index) {
  const name = String(plan.name || '').toLowerCase();
  if (name.includes('starter')) return RATE_TIERS[0];
  if (name.includes('growth')) return RATE_TIERS[1];
  if (name.includes('advanced') || name.includes('enterprise')) return RATE_TIERS[2];
  return RATE_TIERS[Math.min(index, RATE_TIERS.length - 1)];
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const plans = await db.collection('plans')
    .find({})
    .sort({ displayOrder: 1, createdAt: 1, name: 1 })
    .toArray();

  let updated = 0;
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    const defaults = ratesForPlan(plan, index);
    const nextRates = { ...defaults, ...(plan.messageRates || {}) };
    const hasAllRates = ['marketing', 'authentication', 'utility', 'service']
      .every((key) => plan.messageRates?.[key] !== undefined && plan.messageRates?.[key] !== null);
    if (hasAllRates) continue;

    await db.collection('plans').updateOne(
      { _id: plan._id },
      { $set: { messageRates: nextRates, updatedAt: new Date() } },
    );
    updated++;
  }

  console.log(`Plan message-rate migration complete. Updated ${updated}/${plans.length} plan(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
