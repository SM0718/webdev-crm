import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { env } from '../src/env.js';
import { USERNAME_MAX, USERNAME_MIN } from '../constants.js';

/**
 * One-off migration: renames the `email` field on every user to `username`
 * and derives a login handle from the old address.
 *
 *   admin@webdevcrm.com  ->  admin
 *   rahul.sharma@x.com   ->  rahul.sharma
 *   priya+leads@x.com    ->  priyaleads      (+ and other symbols dropped)
 *
 * Passwords, roles, ids and every lead reference are left untouched, so
 * people keep signing in with the same password.
 *
 * Safe by default. Idempotent - users that already have a username are left
 * alone, so re-running is harmless.
 *
 *   node scripts/migrate-email-to-username.js
 *   node scripts/migrate-email-to-username.js --confirm
 */

const confirmed = process.argv.includes('--confirm');

const redact = (uri) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');

/** Strip an email down to a legal handle. */
function deriveHandle(email) {
  const local = String(email).split('@')[0].toLowerCase();
  let handle = local.replace(/[^a-z0-9._-]/g, '');
  handle = handle.replace(/^[^a-z0-9]+/, '');
  handle = handle.replace(/[^a-z0-9._-]+$/, '');
  if (handle.length < USERNAME_MIN) handle = handle.padEnd(USERNAME_MIN, '0');
  handle = handle.slice(0, USERNAME_MAX);
  // `altered` tells us the address did not survive as a clean pass-through.
  return { handle, altered: handle !== local };
}

/** Append -2, -3, ... until the handle is free. */
function makeUnique(base, taken) {
  if (!taken.has(base)) return { handle: base, suffixed: false };
  const stem = base.slice(0, USERNAME_MAX - 3);
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!taken.has(candidate)) return { handle: candidate, suffixed: true };
  }
  throw new Error(`Could not find a free username for "${base}"`);
}

async function main() {
  const connection = await connectDatabase();
  const { name: dbName } = connection.connection;

  console.log(`target database : ${dbName}`);
  console.log(`connection      : ${redact(env.MONGO_URI)}`);
  console.log(`source          : ${env.MONGO_SOURCE}\n`);

  const users = await User.find({}).select('name email username role').lean();
  const legacy = users.filter((u) => !u.username && u.email);
  const already = users.filter((u) => u.username);

  if (already.length) {
    console.log(`already migrated : ${already.length}`);
  }

  if (legacy.length === 0) {
    console.log('\nnothing to migrate - every user already has a username.');
    return;
  }

  // Seed the taken-set so we never collide with an already-migrated user.
  const taken = new Set(already.map((u) => u.username));

  const plan = legacy.map((user) => {
    const { handle, altered } = deriveHandle(user.email);
    const resolved = makeUnique(handle, taken);
    return {
      id: user._id,
      name: user.name,
      role: user.role,
      from: user.email,
      to: resolved.handle,
      altered: altered || resolved.suffixed,
    };
  });
  // Add as we go so two legacy users deriving the same handle cannot clash.
  for (const step of plan) taken.add(step.to);

  console.log(`${plan.length} user(s) to migrate:\n`);
  for (const step of plan) {
    const note = step.altered ? '   <- address could not be used as-is' : '';
    console.log(`  ${step.role.padEnd(6)} ${step.name.padEnd(16)} ${step.from.padEnd(32)} -> ${step.to}${note}`);
  }
  const tweaked = plan.filter((p) => p.altered);
  if (tweaked.length) {
    console.log(
      `\n${tweaked.length} address(es) were not usable as a handle; check the replacement above.`,
    );
  }

  if (!confirmed) {
    console.log('\nDRY RUN - nothing was changed.');
    console.log('re-run with --confirm to apply:');
    console.log('  node scripts/migrate-email-to-username.js --confirm');
    return;
  }

  for (const step of plan) {
    await User.updateOne({ _id: step.id }, { $set: { username: step.to }, $unset: { email: '' } });
  }
  console.log(`\nmigrated        : ${plan.length} user(s)`);

  // The old unique index on `email` would now treat every missing email as
  // null and reject the second document, so it has to go.
  const dropped = await User.collection.dropIndex('email_1').catch(() => null);
  console.log(`dropped email_1 : ${dropped ? 'yes' : 'not present'}`);

  await User.syncIndexes();
  const indexes = (await User.collection.indexes()).map((i) => i.name);
  console.log(`username_1 index: ${indexes.includes('username_1') ? 'present' : 'MISSING'}`);
}

try {
  await main();
  await disconnectDatabase();
  process.exit(0);
} catch (error) {
  console.error('\nmigration failed:', error.message);
  try {
    await disconnectDatabase();
  } catch {
    /* connection may never have opened */
  }
  process.exit(1);
}
