#!/usr/bin/env node
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wa_notifier';

function createRefNumber(ticketId, date) {
  const issuedAt = date instanceof Date && !Number.isNaN(date.getTime())
    ? date
    : ticketId.getTimestamp();
  const year = issuedAt.getFullYear();
  const month = String(issuedAt.getMonth() + 1).padStart(2, '0');
  const day = String(issuedAt.getDate()).padStart(2, '0');
  const suffix = String(ticketId).slice(-6).toUpperCase();
  return `TCK-${year}${month}${day}-${suffix}`;
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const tickets = db.collection('tickets');

  await tickets.createIndex({ refNumber: 1 }, { unique: true, sparse: true });
  await tickets.createIndex({ refNumber: 'text', subject: 'text', category: 'text', lastMessagePreview: 'text' });

  const cursor = tickets.find({
    $or: [
      { refNumber: { $exists: false } },
      { refNumber: null },
      { refNumber: '' },
    ],
  });

  let updated = 0;
  for await (const ticket of cursor) {
    const refNumber = createRefNumber(ticket._id, ticket.createdAt);
    const result = await tickets.updateOne(
      { _id: ticket._id, $or: [{ refNumber: { $exists: false } }, { refNumber: null }, { refNumber: '' }] },
      { $set: { refNumber } },
    );
    updated += result.modifiedCount || 0;
  }

  console.log(`Ticket reference migration complete. Updated ${updated} ticket(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
