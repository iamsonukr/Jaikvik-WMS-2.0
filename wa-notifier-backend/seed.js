#!/usr/bin/env node
/**
 * Demo data seeder for Jaikvik WMS.
 *
 * Usage:
 *   npm run seed
 *
 * Login after seeding:
 *   admin@wanotifier.com / Admin@123        (admin — supreme role, full platform control)
 *   master@wanotifier.com / Master@123      (master — runs campaigns for any client)
 *   owner@jaikvikretail.demo / Owner@123    (client_owner — tenant: Jaikvik Retail)
 *   owner@northstaracademy.demo / Owner@123 (client_owner — tenant: Northstar Academy)
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wa_notifier';

const now = new Date();
const daysAgo = (days, hour = 10) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

// Each demo tenant is a paying platform customer ("Client" in the product
// spec). Not to be confused with the WhatsAppAccount entries below (stored
// in the 'clients' collection for historical/backward-compat reasons) —
// those are the WABA/phone connections that belong to a tenant.
const demoTenants = [
  {
    name: 'Jaikvik Retail',
    slug: 'jaikvik-retail',
    contactEmail: 'owner@jaikvikretail.demo',
    industry: 'E-commerce',
    timezone: 'Asia/Kolkata',
    status: 'active',
  },
  {
    name: 'Northstar Academy',
    slug: 'northstar-academy',
    contactEmail: 'owner@northstaracademy.demo',
    industry: 'Education',
    timezone: 'Asia/Kolkata',
    status: 'active',
  },
];

const demoUsers = [
  {
    email: 'admin@wanotifier.com',
    password: 'Admin@123',
    name: 'Admin',
    role: 'admin', // supreme role — full platform control
    tenantSlug: null,
  },
  {
    email: 'master@wanotifier.com',
    password: 'Master@123',
    name: 'Platform Master',
    role: 'master', // runs campaigns/messaging for any client, manages tenants/plans/pricing
    tenantSlug: null,
    permissions: ['clients:read', 'clients:write', 'wallet:credit'],
  },
  {
    email: 'owner@jaikvikretail.demo',
    password: 'Owner@123',
    name: 'Jaikvik Retail Owner',
    role: 'client_owner',
    tenantSlug: 'jaikvik-retail',
  },
  {
    email: 'owner@northstaracademy.demo',
    password: 'Owner@123',
    name: 'Northstar Academy Owner',
    role: 'client_owner',
    tenantSlug: 'northstar-academy',
  },
];

// WhatsAppAccount (WABA/phone) connections — each belongs to the tenant at
// the same array index in demoTenants.
const demoClients = [
  {
    name: 'Jiakvik Retail',
    wabaId: '100200300400501',
    phoneNumberId: '911000100001',
    accessToken: 'demo_retail_access_token',
    phone: '+919810000001',
    timezone: 'Asia/Kolkata',
    industry: 'E-commerce',
    isActive: true,
  },
  {
    name: 'Northstar Academy',
    wabaId: '100200300400502',
    phoneNumberId: '911000100002',
    accessToken: 'demo_academy_access_token',
    phone: '+919810000002',
    timezone: 'Asia/Kolkata',
    industry: 'Education',
    isActive: true,
  },
];

const demoPlans = [
  {
    name: 'Starter',
    description: 'WhatsApp marketing essentials for small teams getting started.',
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
    description: 'More automation and campaign controls for growing businesses.',
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
    description: 'API access, webhooks, catalogs, and higher operational limits.',
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
    description: 'Custom scale, support, and pricing for high-volume teams.',
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

const contactNames = [
  ['Aarav Sharma', '+919876543210', ['vip', 'newsletter'], { first_name: 'Aarav', city: 'Delhi' }],
  ['Maya Iyer', '+919812345678', ['newsletter'], { first_name: 'Maya', city: 'Bengaluru' }],
  ['Kabir Khan', '+919700001111', ['lead', 'festival'], { first_name: 'Kabir', city: 'Mumbai' }],
  ['Neha Verma', '+919700002222', ['vip'], { first_name: 'Neha', city: 'Pune' }],
  ['Rohan Mehta', '+919700003333', ['support'], { first_name: 'Rohan', city: 'Ahmedabad' }],
  ['Sara Thomas', '+919700004444', ['newsletter', 'festival'], { first_name: 'Sara', city: 'Kochi' }],
  ['Dev Patel', '+919700005555', ['lead'], { first_name: 'Dev', city: 'Surat' }],
  ['Ananya Rao', '+919700006666', ['vip', 'support'], { first_name: 'Ananya', city: 'Hyderabad' }],
  ['Ishaan Bose', '+919700007777', ['newsletter'], { first_name: 'Ishaan', city: 'Kolkata' }],
  ['Priya Menon', '+919700008888', ['festival'], { first_name: 'Priya', city: 'Chennai' }],
  ['Vikram Singh', '+919700009999', ['lead', 'newsletter'], { first_name: 'Vikram', city: 'Jaipur' }],
  ['Tara Nair', '+919700010000', ['support'], { first_name: 'Tara', city: 'Thiruvananthapuram' }],
];

const templateSeed = [
  {
    name: 'order_update',
    category: 'UTILITY',
    language: 'en',
    status: 'APPROVED',
    components: [
      { type: 'BODY', text: 'Hi {{1}}, your order {{2}} is now {{3}}. Reply HELP for assistance.' },
    ],
  },
  {
    name: 'festival_offer',
    category: 'MARKETING',
    language: 'en',
    status: 'APPROVED',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Festival Sale' },
      { type: 'BODY', text: 'Hi {{1}}, enjoy {{2}} off on selected products until {{3}}.' },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Shop now', url: 'https://example.com' }] },
    ],
  },
  {
    name: 'class_reminder',
    category: 'UTILITY',
    language: 'en',
    status: 'APPROVED',
    components: [
      { type: 'BODY', text: 'Reminder: {{1}} starts at {{2}}. Join from your student dashboard.' },
    ],
  },
  {
    name: 'feedback_request',
    category: 'MARKETING',
    language: 'en',
    status: 'PENDING',
    components: [
      { type: 'BODY', text: 'Hi {{1}}, how was your recent experience with us?' },
    ],
  },
];

const chatbotSeed = [
  { keyword: 'help', matchType: 'contains', replyText: 'Thanks for reaching out. A support agent will respond shortly.', priority: 1, isActive: true },
  { keyword: 'price', matchType: 'contains', replyText: 'Please share the product name and we will send the latest pricing.', priority: 2, isActive: true },
  { keyword: 'stop', matchType: 'exact', replyText: 'You have been unsubscribed from promotional messages.', priority: 0, isActive: true },
  { keyword: 'hi', matchType: 'starts_with', replyText: 'Hi! How can we help you today?', priority: 3, isActive: true },
];

function withTimestamps(doc, date = now) {
  return { ...doc, createdAt: date, updatedAt: date };
}

async function upsertTenants(db) {
  const tenants = db.collection('tenants');
  const bySlug = new Map();

  for (const tenant of demoTenants) {
    await tenants.updateOne(
      { slug: tenant.slug },
      { $set: withTimestamps(tenant) },
      { upsert: true },
    );
    bySlug.set(tenant.slug, await tenants.findOne({ slug: tenant.slug }));
  }

  return bySlug;
}

async function upsertUsers(db, tenantsBySlug) {
  const users = db.collection('users');

  for (const user of demoUsers) {
    const hash = await bcrypt.hash(user.password, 10);
    const tenant = user.tenantSlug ? tenantsBySlug.get(user.tenantSlug) : null;
    await users.updateOne(
      { email: user.email },
      {
        $set: withTimestamps({
          email: user.email,
          password: hash,
          name: user.name,
          role: user.role,
          tenantId: tenant ? tenant._id : null,
          permissions: user.permissions || [],
          isActive: true,
        }),
      },
      { upsert: true },
    );
  }
}

async function upsertClients(db, tenantsBySlug) {
  const clients = db.collection('clients');
  const result = [];

  for (let i = 0; i < demoClients.length; i++) {
    const client = demoClients[i];
    const tenant = tenantsBySlug.get(demoTenants[i].slug);
    await clients.updateOne(
      { phoneNumberId: client.phoneNumberId },
      { $set: withTimestamps({ ...client, tenantId: tenant._id }) },
      { upsert: true },
    );
    result.push(await clients.findOne({ phoneNumberId: client.phoneNumberId }));
  }

  return result;
}

async function upsertPlans(db) {
  const plans = db.collection('plans');
  const byName = new Map();

  for (const plan of demoPlans) {
    await plans.updateOne(
      { name: plan.name },
      { $set: withTimestamps(plan) },
      { upsert: true },
    );
    byName.set(plan.name, await plans.findOne({ name: plan.name }));
  }

  return byName;
}

async function refreshClientData(db, client, clientIndex) {
  const clientId = client._id;
  const tenantId = client.tenantId;
  const contacts = db.collection('contacts');
  const templates = db.collection('templates');
  const broadcasts = db.collection('broadcasts');
  const broadcastlogs = db.collection('broadcastlogs');
  const messages = db.collection('messages');
  const chatbotrules = db.collection('chatbotrules');

  const oldBroadcasts = await broadcasts.find({ clientId }).project({ _id: 1 }).toArray();
  const oldBroadcastIds = oldBroadcasts.map(b => b._id);

  await Promise.all([
    contacts.deleteMany({ clientId }),
    templates.deleteMany({ clientId }),
    broadcasts.deleteMany({ clientId }),
    broadcastlogs.deleteMany({ $or: [{ clientId }, { broadcastId: { $in: oldBroadcastIds } }] }),
    messages.deleteMany({ clientId }),
    chatbotrules.deleteMany({ clientId }),
  ]);

  const clientContacts = clientIndex === 0 ? contactNames : contactNames.slice(0, 8);
  const shiftedContacts = clientContacts.map(([name, phone, tags, variables], index) => withTimestamps({
    clientId,
    tenantId,
    name,
    phone: phone.replace('+9197', `+919${7 + clientIndex}`),
    tags,
    variables,
    isActive: true,
    isOptedOut: index === 10,
  }, daysAgo(25 - index)));

  await contacts.insertMany(shiftedContacts);
  const savedContacts = await contacts.find({ clientId }).toArray();

  const seededTemplates = templateSeed.map(t => withTimestamps({
    ...t,
    clientId,
    tenantId,
    rawMeta: { id: `${client.phoneNumberId}_${t.name}`, seeded: true },
  }, daysAgo(20)));
  await templates.insertMany(seededTemplates);

  const campaignTemplates = clientIndex === 0
    ? ['festival_offer', 'order_update', 'feedback_request']
    : ['class_reminder', 'festival_offer', 'feedback_request'];

  const campaignDocs = clientIndex === 0
    ? [
      {
        name: 'July Festival Promo',
        templateName: campaignTemplates[0],
        languageCode: 'en',
        targetTags: ['festival'],
        status: 'done',
        date: daysAgo(10, 11),
        totalCount: 8,
        sentCount: 8,
        deliveredCount: 7,
        readCount: 5,
        failedCount: 1,
      },
      {
        name: 'VIP Order Updates',
        templateName: campaignTemplates[1],
        languageCode: 'en',
        targetTags: ['vip'],
        status: 'running',
        date: daysAgo(3, 14),
        totalCount: 5,
        sentCount: 4,
        deliveredCount: 3,
        readCount: 2,
        failedCount: 0,
      },
      {
        name: 'Feedback Follow-up',
        templateName: campaignTemplates[2],
        languageCode: 'en',
        targetTags: [],
        status: 'draft',
        date: daysAgo(1, 9),
        totalCount: 12,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
      },
    ]
    : [
      {
        name: 'Admission Reminder Batch',
        templateName: campaignTemplates[0],
        languageCode: 'en',
        targetTags: ['lead'],
        status: 'done',
        date: daysAgo(8, 11),
        totalCount: 6,
        sentCount: 6,
        deliveredCount: 5,
        readCount: 3,
        failedCount: 1,
      },
      {
        name: 'Weekend Webinar Invites',
        templateName: campaignTemplates[1],
        languageCode: 'en',
        targetTags: ['newsletter'],
        status: 'done',
        date: daysAgo(4, 15),
        totalCount: 4,
        sentCount: 4,
        deliveredCount: 4,
        readCount: 2,
        failedCount: 0,
      },
      {
        name: 'Course Feedback Follow-up',
        templateName: campaignTemplates[2],
        languageCode: 'en',
        targetTags: [],
        status: 'draft',
        date: daysAgo(1, 9),
        totalCount: 8,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
      },
    ];

  const insertedBroadcasts = await broadcasts.insertMany(campaignDocs.map(c => withTimestamps({
    clientId,
    tenantId,
    name: c.name,
    templateName: c.templateName,
    languageCode: c.languageCode,
    components: [],
    targetTags: c.targetTags,
    status: c.status,
    scheduledAt: c.status === 'draft' ? daysAgo(-2, 10) : undefined,
    totalCount: c.totalCount,
    sentCount: c.sentCount,
    deliveredCount: c.deliveredCount,
    readCount: c.readCount,
    failedCount: c.failedCount,
  }, c.date)));

  const broadcastList = Object.values(insertedBroadcasts.insertedIds).map((id, index) => ({ _id: id, ...campaignDocs[index] }));
  const logStatuses = ['read', 'read', 'delivered', 'delivered', 'sent', 'read', 'failed', 'delivered'];

  const logs = broadcastList.flatMap((broadcast, bIndex) => {
    if (broadcast.status === 'draft') return [];
    return savedContacts.slice(0, broadcast.totalCount).map((contact, index) => {
      const status = logStatuses[index % logStatuses.length];
      return withTimestamps({
        broadcastId: broadcast._id,
        clientId,
        tenantId,
        phone: contact.phone,
        contactName: contact.name,
        waMessageId: status === 'failed' ? undefined : `wamid.demo.${clientIndex}.${bIndex}.${index}`,
        status,
        errorCode: status === 'failed' ? '131026' : undefined,
        errorMessage: status === 'failed' ? 'Message undeliverable in demo data' : undefined,
      }, daysAgo(10 - bIndex * 3, 12 + index));
    });
  });

  if (logs.length) await broadcastlogs.insertMany(logs);

  const threadContacts = savedContacts.slice(0, 5);
  const messageDocs = threadContacts.flatMap((contact, index) => {
    const threadStatus = index === 3 ? 'resolved' : index === 4 ? 'assigned' : 'open';
    return [
      withTimestamps({
        clientId,
        tenantId,
        phone: contact.phone,
        contactName: contact.name,
        direction: 'inbound',
        type: 'text',
        text: ['Hi, I need help with my order', 'What is the price?', 'Please send catalog', 'Thanks, resolved', 'Can I talk to support?'][index],
        waMessageId: `wamid.in.${clientIndex}.${index}`,
        threadStatus,
        timestamp: daysAgo(index, 9),
      }, daysAgo(index, 9)),
      withTimestamps({
        clientId,
        tenantId,
        phone: contact.phone,
        contactName: contact.name,
        direction: 'outbound',
        type: 'text',
        text: ['Sure, please share your order ID.', 'I can help with that. Which item?', 'Catalog sent. Please check the link.', 'Glad we could help!', 'A support agent will reply shortly.'][index],
        waMessageId: `wamid.out.${clientIndex}.${index}`,
        threadStatus,
        timestamp: daysAgo(index, 10),
      }, daysAgo(index, 10)),
    ];
  });

  await messages.insertMany(messageDocs);

  await chatbotrules.insertMany(chatbotSeed.map((rule, index) => withTimestamps({
    ...rule,
    clientId,
    tenantId,
  }, daysAgo(15 - index))));
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Connected to MongoDB: ${uri}`);

  await upsertPlans(db);
  const tenantsBySlug = await upsertTenants(db);
  await upsertUsers(db, tenantsBySlug);
  const clients = await upsertClients(db, tenantsBySlug);

  for (let i = 0; i < clients.length; i++) {
    await refreshClientData(db, clients[i], i);
  }

  console.log('\nSeed complete.');
  console.log('Demo users:');
  console.log('  admin@wanotifier.com / Admin@123          (admin — supreme role)');
  console.log('  master@wanotifier.com / Master@123        (master — runs campaigns for any client)');
  console.log('  owner@jaikvikretail.demo / Owner@123     (client_owner)');
  console.log('  owner@northstaracademy.demo / Owner@123  (client_owner)');
  console.log(`Demo tenants: ${demoTenants.map(t => t.name).join(', ')}`);
  console.log(`Demo WhatsApp accounts: ${clients.map(c => c.name).join(', ')}`);
  console.log('\nTip: change demo passwords before using this outside local development.\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
