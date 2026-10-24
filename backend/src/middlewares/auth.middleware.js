import { verifyAccessToken } from '../utils/token.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export function requireAuth(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
  if (!match) return next(new AppError(401, 'Authentication required'));
  try {
    req.userId = verifyAccessToken(match[1]);
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired access token'));
  }
}

// Mandatory Origin plus a custom header prevents cookie-authenticated form CSRF.
// This applies to login too, preventing an attacker from logging a victim in.
export function requireCsrfProtection(req, res, next) {
  if (req.get('origin') !== env.frontendOrigin || req.get('x-csrf-protection') !== '1') {
    return next(new AppError(403, 'CSRF validation failed'));
  }
  next();
}
