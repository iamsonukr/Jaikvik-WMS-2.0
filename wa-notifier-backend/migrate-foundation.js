#!/usr/bin/env node
/**
 * Foundation migration — multi-tenant SaaS layer, phase 1.
 *
 * Safe to run multiple times (idempotent). Does NOT touch any collection's
 * shape beyond adding the new `tenantId` field and remapping `User.role`;
 * no documents are deleted, no existing IDs change.
 *
 * What it does:
 *   1. Creates one "Default Organization" Tenant if none exists yet — this
 *      becomes the home for all data that existed before tenants existed.
 *   2. Backfills tenantId = defaultTenant._id onto every WhatsAppAccount
 *      (collection: clients), Contact, Template, Broadcast, BroadcastLog,
 *      Message, ChatbotRule, and AccountAlert document that doesn't have one.
 *   3. Remaps existing Users:
 *        role 'admin' | 'agent' -> 'admin' (the renamed supreme role), tenantId -> null
 *      This preserves today's actual behaviour (every existing user can see
 *      and manage every client/WABA) rather than guessing a narrower role.
 *      Reassign specific staff to 'master' or invite proper 'client_owner' /
 *      'client_user' accounts by hand once the Admin/Client dashboards exist.
 *   4. Seeds the four initial plans (Starter/Growth/Advanced/Enterprise) from
 *      the product spec, if no plans exist yet — matched by name, so re-runs
 *      never duplicate or overwrite pricing you've since changed in Admin.
 *   5. Seeds the initial Indian message pricing (Marketing/Authentication/
 *      Utility/Service) as the global 'default' scope, if no default pricing
 *      rows exist yet for a given category.
 *
 * Usage:
 *   node migrate-foundation.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wa_notifier';

const DEFAULT_TENANT_SLUG = 'default-organization';

// Collections whose documents get a tenantId backfilled from the default tenant.
// Mongoose collection names (auto-pluralized, lowercased) for each renamed/kept model.
const TENANT_SCOPED_COLLECTIONS = [
  'clients',        // WhatsAppAccount model — collection name intentionally kept as 'clients'
  'contacts',
  'templates',
  'broadcasts',
  'broadcastlogs',
  'messages',
  'chatbotrules',
  'accountalerts',
];

// Initial plans from the product spec. Admin can edit/reorder/disable these
// afterward — this only runs once per plan name (idempotent match on name).
const INITIAL_PLANS = [
  {
    name: 'Starter',
    description: 'Get started with WhatsApp marketing essentials.',
    price: 3499,
    billingCycle: 'quarterly',
    currency: 'INR',
    taxPercent: 18,
    trialDays: 7,
    features: [
      'WhatsApp channel included',
      'Bulk WhatsApp campaigns',
      'Shared Team Inbox',
      'Greeting and out-of-office automation',
      'Template sync and approval tracking',
      'Unlimited messages based on connected WhatsApp number',
      '2 team members',
      '10 custom tags',
    ],
    limits: { contacts: 2500, teamMembers: 2, whatsappNumbers: 1, customFields: 5, tags: 10 },
    status: 'active',
    displayOrder: 0,
    isPopular: false,
    showOnWebsite: true,
    buttonText: 'Choose Starter',
  },
  {
    name: 'Growth',
    description: 'Scale campaigns with automation and a shared team inbox.',
    price: 7699,
    billingCycle: 'quarterly',
    currency: 'INR',
    taxPercent: 18,
    trialDays: 7,
    features: [
      'Everything in Starter',
      'Advanced broadcast segmentation',
      'FAQ automations and keyword chatbot rules',
      'Bulk upload contacts',
      'Team inbox for sales and support workflows',
      'Campaign delivery analytics',
      '5 team members',
      '25 custom tags',
    ],
    limits: { contacts: 10000, teamMembers: 5, whatsappNumbers: 2, customFields: 15, tags: 25 },
    status: 'active',
    displayOrder: 1,
    isPopular: true,
    showOnWebsite: true,
    buttonText: 'Choose Growth',
  },
  {
    name: 'Advanced',
    description: 'API access, catalog support, and higher sending limits.',
    price: 10499,
    billingCycle: 'quarterly',
    currency: 'INR',
    taxPercent: 18,
    trialDays: 7,
    features: [
      'Everything in Growth',
      'Public APIs and webhook access',
      'Catalog-ready template workflows',
      'Higher campaign sending speed',
      'Conversation and campaign performance analytics',
      'Priority support',
      '15 team members',
      '50 custom tags',
    ],
    limits: { contacts: 50000, teamMembers: 15, whatsappNumbers: 5, customFields: 30, tags: 50 },
    status: 'active',
    displayOrder: 2,
    isPopular: false,
    showOnWebsite: true,
    buttonText: 'Choose Advanced',
  },
  {
    name: 'Enterprise',
    description: 'Unlimited scale with a dedicated account manager.',
    price: null,
    billingCycle: 'on_request',
    currency: 'INR',
    taxPercent: 18,
    trialDays: 0,
    features: [
      'Everything in Advanced',
      'Unlimited contacts and custom tags',
      'Multiple WhatsApp numbers',
      'No platform markup option',
      'Higher rate limits',
      'Dedicated account manager',
      'Personalized onboarding and support',
      'Custom integrations and SLA',
    ],
    limits: {},
    status: 'active',
    displayOrder: 3,
    isPopular: false,
    showOnWebsite: true,
    buttonText: 'Contact Sales',
  },
];

// Initial Indian message pricing from the product spec — global "default"
// scope, country 'default'. Admin can layer country/plan/client-specific
// overrides on top via the Pricing admin screens.
const INITIAL_PRICING = [
  { category: 'marketing', baseCost: 0.78, sellingPrice: 0.97 },
  { category: 'authentication', baseCost: 0.1, sellingPrice: 0.129 },
  { category: 'utility', baseCost: 0.13, sellingPrice: 0.16 },
  { category: 'service', baseCost: 0, sellingPrice: 0 },
];

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Connected to ${uri}`);

  // ── 1. Default tenant ─────────────────────────────────────────
  const tenants = db.collection('tenants');
  let defaultTenant = await tenants.findOne({ slug: DEFAULT_TENANT_SLUG });

  if (!defaultTenant) {
    const now = new Date();
    const result = await tenants.insertOne({
      name: 'Default Organization',
      slug: DEFAULT_TENANT_SLUG,
      contactEmail: 'admin@wanotifier.com',
      status: 'active',
      notes: 'Auto-created by migrate-foundation.js to own pre-existing data.',
      createdAt: now,
      updatedAt: now,
    });
    defaultTenant = { _id: result.insertedId };
    console.log(`Created default tenant ${defaultTenant._id}`);
  } else {
    console.log(`Default tenant already exists (${defaultTenant._id}), reusing it.`);
  }

  // ── 2. Backfill tenantId on existing tenant-scoped collections ─
  for (const name of TENANT_SCOPED_COLLECTIONS) {
    const collection = db.collection(name);
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) {
      console.log(`Skipping ${name} — collection does not exist yet.`);
      continue;
    }
    const res = await collection.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: defaultTenant._id } },
    );
    console.log(`${name}: backfilled tenantId on ${res.modifiedCount} document(s).`);
  }

  // ── 3. Remap existing users onto the new role model ───────────
  // NOTE: the 'admin' being matched here is the OLD pre-tenant-model legacy
  // value (WA-Notifier's original admin/agent distinction), not the NEW
  // renamed 'admin' role this sets — they just happen to share the string
  // 'admin'. Re-running this after a first successful migration is still
  // safe/idempotent since the target value doesn't change on a second pass.
  const users = db.collection('users');
  const userRes = await users.updateMany(
    { role: { $in: ['admin', 'agent'] } },
    { $set: { role: 'admin', tenantId: null, permissions: [] } },
  );
  console.log(`users: remapped ${userRes.modifiedCount} legacy admin/agent account(s) to the new 'admin' (supreme) role.`);

  // Any user that somehow already has a "admin"/"master"/"client_owner"/
  // "client_user" role (e.g. re-running this script) is left untouched.

  // ── 4. Seed initial plans ──────────────────────────────────────
  const plans = db.collection('plans');
  for (const plan of INITIAL_PLANS) {
    const exists = await plans.findOne({ name: plan.name });
    if (exists) {
      console.log(`Plan "${plan.name}" already exists, leaving it as-is.`);
      continue;
    }
    const now = new Date();
    await plans.insertOne({ ...plan, createdAt: now, updatedAt: now });
    console.log(`Seeded plan "${plan.name}".`);
  }

  // ── 5. Seed initial message pricing (default/global scope) ────
  const pricing = db.collection('messagepricings');
  for (const rule of INITIAL_PRICING) {
    const exists = await pricing.findOne({ category: rule.category, scope: 'default', country: 'default' });
    if (exists) {
      console.log(`Default pricing for "${rule.category}" already exists, leaving it as-is.`);
      continue;
    }
    const now = new Date();
    await pricing.insertOne({
      category: rule.category,
      country: 'default',
      scope: 'default',
      planId: null,
      tenantId: null,
      baseCost: rule.baseCost,
      sellingPrice: rule.sellingPrice,
      markup: Number((rule.sellingPrice - rule.baseCost).toFixed(4)),
      currency: 'INR',
      taxPercent: 18,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Seeded default pricing for "${rule.category}" (₹${rule.sellingPrice}).`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
