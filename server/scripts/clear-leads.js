import { connectDatabase, disconnectDatabase } from '../config/db.js';
import Lead from '../models/Lead.js';
import { env } from '../src/env.js';

/**
 * Deletes every document in the `leads` collection and nothing else.
 *
 * Safe by default: without --confirm it only reports what it would delete.
 *
 *   node scripts/clear-leads.js            # dry run, prints the count
 *   node scripts/clear-leads.js --confirm  # actually deletes
 *
 * Remarks are embedded in the lead document, so they go with it. No other
 * collection is touched — team members and the admin account are untouched.
 */

const confirmed = process.argv.includes('--confirm');

/** Never let a password reach the console. */
const redact = (uri) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');

async function main() {
  const connection = await connectDatabase();
  const { name: dbName } = connection.connection;

  console.log(`target database : ${dbName}`);
  console.log(`connection      : ${redact(env.MONGO_URI)}`);
  console.log(`collection      : ${Lead.collection.name}`);
  console.log(`source          : ${env.MONGO_SOURCE}`);

  const total = await Lead.estimatedDocumentCount();
  console.log(`\nleads found     : ${total}`);

  if (total === 0) {
    console.log('\nnothing to delete.');
    return;
  }

  if (!confirmed) {
    console.log('\nDRY RUN — nothing was deleted.');
    console.log('re-run with --confirm to actually delete these documents:');
    console.log('  node scripts/clear-leads.js --confirm');
    return;
  }

  const result = await Lead.deleteMany({});
  console.log(`\ndeleted         : ${result.deletedCount} lead(s)`);

  const remaining = await Lead.estimatedDocumentCount();
  console.log(`leads remaining : ${remaining}`);
}

try {
  await main();
  await disconnectDatabase();
  process.exit(0);
} catch (error) {
  console.error('\nclear-leads failed:', error.message);
  try {
    await disconnectDatabase();
  } catch {
    /* connection may never have opened */
  }
  process.exit(1);
}
