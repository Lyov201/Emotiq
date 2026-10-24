import { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } from '../utils/cookies.js';

export const createAuthController = service => ({
  async register(req, res) {
    const user = await service.register(req.validatedBody);
    res.status(201).json({ success: true, message: 'Registration successful', data: { user } });
  },
  async login(req, res) {
    const { refreshToken, ...data } = await service.login(req.validatedBody);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ success: true, message: 'Login successful', data });
  },
  async me(req, res) {
    const user = await service.me(req.userId);
    res.status(200).json({ success: true, data: { user } });
  },
  async refresh(req, res) {
    const { refreshToken, ...data } = await service.refresh(req.cookies?.[REFRESH_COOKIE_NAME]);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ success: true, message: 'Token refreshed', data });
  },
  async logout(req, res) {
    await service.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);
    res.status(204).end();
  },
});
