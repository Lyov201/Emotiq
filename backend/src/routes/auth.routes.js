import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';
import { createAuthService } from '../services/auth.service.js';
import { requireAuth, requireCsrfProtection } from '../middlewares/auth.middleware.js';
import { createAuthRateLimits } from '../middlewares/authRateLimit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema } from '../validations/auth.validation.js';

export function createAuthRouter(db) {
  const router = Router();
  const controller = createAuthController(createAuthService(db));
  const limits = createAuthRateLimits();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/register', limits.register, requireCsrfProtection, validate(registerSchema), controller.register);
  router.post('/login', limits.login, requireCsrfProtection, validate(loginSchema), controller.login);
  router.get('/me', limits.me, requireAuth, controller.me);
  router.post('/refresh', limits.refresh, requireCsrfProtection, controller.refresh);
  router.post('/logout', limits.logout, requireCsrfProtection, controller.logout);
  return router;
}
