import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, verifyPassword, getDummyPasswordHash } from '../utils/password.js';
import {
  generateRefreshToken, hashRefreshToken, isRefreshToken,
  refreshTokenExpiry, signAccessToken, ACCESS_TOKEN_SECONDS,
} from '../utils/token.js';

export const safeUserSelect = { id: true, name: true, email: true };
const invalidRefresh = () => new AppError(401, 'Invalid or expired refresh token');
const accessData = userId => ({ accessToken: signAccessToken(userId), expiresIn: ACCESS_TOKEN_SECONDS });

export function createAuthService(db = prisma) {
  return {
    async register({ name, email, password }) {
      if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new AppError(409, 'Email is already registered');
      }
      const passwordHash = await hashPassword(password);
      try {
        return await db.user.create({ data: { name, email, passwordHash }, select: safeUserSelect });
      } catch (error) {
        if (error.code === 'P2002') throw new AppError(409, 'Email is already registered');
        throw error;
      }
    },

    async login({ email, password }) {
      const user = await db.user.findUnique({ where: { email }, select: { ...safeUserSelect, passwordHash: true } });
      const hash = user?.passwordHash ?? await getDummyPasswordHash();
      const valid = await verifyPassword(hash, password);
      if (!user || !valid) throw new AppError(401, 'Invalid email or password');
      const refreshToken = generateRefreshToken();
      const data = accessData(user.id);
      await db.refreshToken.create({ data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiry(),
      } });
      return { ...data, user: { id: user.id, name: user.name, email: user.email }, refreshToken };
    },

    async me(userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: safeUserSelect });
      if (!user) throw new AppError(401, 'Authentication required');
      return user;
    },

    async refresh(token) {
      if (!isRefreshToken(token)) throw invalidRefresh();
      const tokenHash = hashRefreshToken(token);
      return db.$transaction(async tx => {
        const now = new Date();
        const current = await tx.refreshToken.findFirst({
          where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        });
        if (!current) throw invalidRefresh();
        // Conditional UPDATE takes a row lock. After a competing transaction commits,
        // PostgreSQL rechecks revokedAt and only one request can claim this token.
        const claimed = await tx.refreshToken.updateMany({
          where: { id: current.id, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { revokedAt: now },
        });
        if (claimed.count !== 1) throw invalidRefresh();
        const refreshToken = generateRefreshToken();
        const data = accessData(current.userId);
        await tx.refreshToken.create({ data: {
          userId: current.userId,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: refreshTokenExpiry(),
        } });
        return { ...data, refreshToken };
      });
    },

    async logout(token) {
      if (!isRefreshToken(token)) return;
      await db.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
