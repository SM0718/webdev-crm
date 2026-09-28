import jwt from 'jsonwebtoken';

import { env } from '../src/env.js';
import { ApiError, asyncHandler } from './error.js';
import { User } from '../models/User.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

/** Verifies the bearer token and hydrates `req.user` with the live DB record. */
export const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) throw ApiError.unauthorized('Missing authentication token.');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (error) {
    const message = error.name === 'TokenExpiredError' ? 'Your session expired. Please sign in again.' : 'Invalid session token.';
    throw ApiError.unauthorized(message);
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('This account no longer exists.');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated. Contact your admin.');

  req.user = user;
  next();
});

/** Route guard - must run after `verifyToken`. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('This action is restricted to the agency admin.'));
    }
    return next();
  };
}

export const requireAdmin = requireRole('admin');
