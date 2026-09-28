import bcrypt from 'bcryptjs';

import { env } from '../src/env.js';
import { User } from '../models/User.js';
import { signToken } from '../middlewares/auth.js';
import { ApiError, asyncHandler } from '../middlewares/error.js';

const BCRYPT_ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');

  // Same generic message for "no such user" and "wrong password".
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact your admin.');
  }

  res.json({ success: true, token: signToken(user), user: user.toSafeJSON() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafeJSON() });
});

/**
 * Creates the single admin account from `.env`. Idempotent: safe to call on
 * every boot, and exposed as a route so a fresh deployment can self-heal.
 */
export const seedAdmin = asyncHandler(async (req, res) => {
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    return res.json({
      success: true,
      created: false,
      message: 'An admin already exists - nothing to seed.',
      user: existingAdmin.toSafeJSON(),
    });
  }

  const created = await User.create({
    name: env.ADMIN_NAME,
    email: env.ADMIN_EMAIL.toLowerCase(),
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    role: 'admin',
    isActive: true,
  });

  console.log(`[seed] admin created for ${created.email}`);
  return res.status(201).json({ success: true, created: true, user: created.toSafeJSON() });
});

/** Called once during boot. */
export async function seedAdminOnBoot() {
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log(`[seed] admin present: ${existingAdmin.email}`);
    return;
  }

  const created = await User.create({
    name: env.ADMIN_NAME,
    email: env.ADMIN_EMAIL.toLowerCase(),
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    role: 'admin',
    isActive: true,
  });

  console.log(`[seed] admin created for ${created.email}`);
}
