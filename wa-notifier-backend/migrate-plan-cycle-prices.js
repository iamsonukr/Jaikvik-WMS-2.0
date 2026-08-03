#!/usr/bin/env node
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wa_notifier';

const defaultCyclePricesByPlanName = {
  starter: { monthly: 1299, quarterly: 3499, yearly: 11999 },
  growth: { monthly: 2799, quarterly: 7699, yearly: 26999 },
  advanced: { monthly: 3899, quarterly: 10499, yearly: 36999 },
};

function fallbackPricesForPlan(plan) {
  const name = String(plan.name || '').trim().toLowerCase();
  return defaultCyclePricesByPlanName[name] || null;
}

function normalizePrice(price, billingCycle = 'quarterly') {
  if (price === null || price === undefined) return null;
  if (typeof price === 'number') {
    const cycle = ['monthly', 'quarterly', 'yearly'].includes(billingCycle) ? billingCycle : 'quarterly';
    return { monthly: null, quarterly: null, yearly: null, [cycle]: price };
  }
  return {
    monthly: price.monthly ?? null,
    quarterly: price.quarterly ?? null,
    yearly: price.yearly ?? null,
  };
}

function fillMissingCyclePrices(price, fallback) {
  if (!price || !fallback) return price;
  return {
    monthly: price.monthly ?? fallback.monthly ?? null,
    quarterly: price.quarterly ?? fallback.quarterly ?? null,
    yearly: price.yearly ?? fallback.yearly ?? null,
  };
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const plans = await db.collection('plans').find({}).toArray();

  let updated = 0;
  for (const plan of plans) {
    const nextPrice = fillMissingCyclePrices(
      normalizePrice(plan.price, plan.billingCycle || 'quarterly'),
      fallbackPricesForPlan(plan),
    );
    const priceChanged = JSON.stringify(nextPrice) !== JSON.stringify(plan.price ?? null);
    const hasLegacyCycle = Object.prototype.hasOwnProperty.call(plan, 'billingCycle');
    if (!priceChanged && !hasLegacyCycle) continue;

    await db.collection('plans').updateOne(
      { _id: plan._id },
      { $set: { price: nextPrice, updatedAt: new Date() }, $unset: { billingCycle: '' } },
    );
    updated++;
  }
  console.log(`Plan cycle-price migration complete. Updated ${updated}/${plans.length} plan(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});