import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'emotiq_refresh';
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  path: '/api/auth',
});

export const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE_NAME, token, {
  ...refreshCookieOptions(),
  maxAge: env.refreshTokenExpiresDays * 86400000,
});

export const clearRefreshCookie = res => res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
