#!/usr/bin/env node
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wa_notifier';

const referenceCollections = [
  {
    name: 'contacts',
    indexes: [
      { keys: { whatsappAccountId: 1, phone: 1 }, options: { unique: true } },
      { keys: { tenantId: 1 }, options: {} },
    ],
  },
  {
    name: 'contacttags',
    indexes: [
      { keys: { whatsappAccountId: 1, normalizedName: 1 }, options: { unique: true } },
      { keys: { tenantId: 1 }, options: {} },
    ],
  },
  {
    name: 'contactimports',
    indexes: [
      { keys: { whatsappAccountId: 1, createdAt: -1 }, options: {} },
      { keys: { tenantId: 1, createdAt: -1 }, options: {} },
    ],
  },
  {
    name: 'contactsegments',
    indexes: [
      { keys: { whatsappAccountId: 1, name: 1 }, options: { unique: true } },
      { keys: { tenantId: 1, createdAt: -1 }, options: {} },
    ],
  },
  {
    name: 'templates',
    indexes: [
      { keys: { whatsappAccountId: 1, name: 1 }, options: { unique: true } },
      { keys: { tenantId: 1 }, options: {} },
    ],
  },
  {
    name: 'broadcasts',
    indexes: [
      { keys: { whatsappAccountId: 1, createdAt: -1 }, options: {} },
      { keys: { tenantId: 1 }, options: {} },
    ],
  },
  {
    name: 'broadcastlogs',
    indexes: [
      { keys: { broadcastId: 1 }, options: {} },
      { keys: { whatsappAccountId: 1 }, options: {} },
      { keys: { waMessageId: 1 }, options: {} },
    ],
  },
  {
    name: 'messages',
    indexes: [
      { keys: { whatsappAccountId: 1, phone: 1 }, options: {} },
      { keys: { tenantId: 1 }, options: {} },
    ],
  },
  {
    name: 'chatbotrules',
    indexes: [
      { keys: { whatsappAccountId: 1, priority: 1 }, options: {} },
      { keys: { tenantId: 1 }, options: {} },
    ],
  },
  {
    name: 'accountalerts',
    indexes: [
      { keys: { whatsappAccountId: 1, createdAt: -1 }, options: {} },
      { keys: { entityId: 1, type: 1, createdAt: -1 }, options: {} },
    ],
  },
];

async function collectionExists(db, name) {
  return db.listCollections({ name }, { nameOnly: true }).hasNext();
}

async function renameAccountsCollection(db) {
  const sourceExists = await collectionExists(db, 'clients');
  const targetExists = await collectionExists(db, 'whatsappaccounts');

  if (!sourceExists && !targetExists) {
    console.log('No clients/whatsappaccounts collection found; skipping account collection rename.');
    return;
  }

  if (sourceExists && !targetExists) {
    await db.collection('clients').rename('whatsappaccounts');
    console.log('Renamed collection: clients -> whatsappaccounts');
  } else if (sourceExists && targetExists) {
    const sourceDocs = await db.collection('clients').find({}).toArray();
    if (sourceDocs.length) {
      await db.collection('whatsappaccounts').bulkWrite(
        sourceDocs.map((doc) => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    console.log(`Copied ${sourceDocs.length} legacy clients document(s) into whatsappaccounts. Left clients collection in place as a backup.`);
  } else {
    console.log('whatsappaccounts collection already exists; skipping account collection rename.');
  }

  await db.collection('whatsappaccounts').createIndex({ phoneNumberId: 1 }, { unique: true });
  await db.collection('whatsappaccounts').createIndex({ tenantId: 1 });
}

async function dropClientIdIndexes(collection) {
  const indexes = await collection.indexes();
  for (const index of indexes) {
    if (index.name === '_id_') continue;
    if (Object.prototype.hasOwnProperty.call(index.key || {}, 'clientId')) {
      await collection.dropIndex(index.name).catch((err) => {
        if (err?.codeName !== 'IndexNotFound') throw err;
      });
      console.log(`Dropped old index ${collection.collectionName}.${index.name}`);
    }
  }
}

async function migrateReferenceCollection(db, spec) {
  if (!(await collectionExists(db, spec.name))) {
    console.log(`Collection ${spec.name} not found; skipping.`);
    return;
  }

  const collection = db.collection(spec.name);
  await dropClientIdIndexes(collection);

  const renamed = await collection.updateMany(
    { clientId: { $exists: true }, whatsappAccountId: { $exists: false } },
    {
      $rename: { clientId: 'whatsappAccountId' },
      $set: { updatedAt: new Date() },
    },
  );

  const cleaned = await collection.updateMany(
    { clientId: { $exists: true }, whatsappAccountId: { $exists: true } },
    { $unset: { clientId: '' }, $set: { updatedAt: new Date() } },
  );

  for (const index of spec.indexes) {
    await collection.createIndex(index.keys, index.options);
  }

  console.log(
    `${spec.name}: renamed ${renamed.modifiedCount} document(s), removed duplicate legacy field from ${cleaned.modifiedCount} document(s).`,
  );
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  await renameAccountsCollection(db);
  for (const spec of referenceCollections) {
    await migrateReferenceCollection(db, spec);
  }

  console.log('WhatsApp account naming migration complete.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
