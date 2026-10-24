import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_SECONDS = 900;
export const generateRefreshToken = () => randomBytes(32).toString('hex');
export const hashRefreshToken = token => createHash('sha256').update(token).digest('hex');
export const isRefreshToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export const refreshTokenExpiry = () => new Date(Date.now() + env.refreshTokenExpiresDays * 86400000);

export const signAccessToken = userId => jwt.sign({}, env.jwtAccessSecret, {
  algorithm: 'HS256',
  subject: userId,
  expiresIn: env.jwtAccessExpiresIn,
  issuer: env.jwtIssuer,
  audience: env.jwtAudience,
});

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtAccessSecret, {
    algorithms: ['HS256'],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    maxAge: env.jwtAccessExpiresIn,
  });
  if (typeof payload !== 'object' || typeof payload.sub !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
    || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)) {
    throw new Error('Invalid access token');
  }
  return payload.sub;
}
