import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createSessionService } from '../services/session.service.js';
import { startSessionSchema, sessionIdSchema, sendMessageSchema, sessionPageSchema } from '../validations/session.validation.js';

export function createSessionRouter(db, chat) {
  const router = Router();
  const service = createSessionService(db, chat);
  router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.post('/', validate(startSessionSchema), async (req, res) => {
    res.json({ success: true, data: { session: await service.start(req.userId, req.validatedBody) } });
  });
  router.get('/', validate(sessionPageSchema, 'query'), async (req, res) => {
    res.json({ success: true, data: await service.list(req.userId, req.validatedQuery) });
  });
  router.use('/:id', validate(sessionIdSchema, 'params'));
  router.get('/:id', async (req, res) => {
    res.json({ success: true, data: { session: await service.get(req.userId, req.validatedParams.id) } });
  });
  router.get('/:id/messages', validate(sessionPageSchema, 'query'), async (req, res) => {
    res.json({ success: true, data: await service.messages(req.userId, req.validatedParams.id, req.validatedQuery) });
  });
  router.post('/:id/messages', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
    validate(sendMessageSchema), async (req, res) => {
      res.status(201).json({ success: true, data: await service.send(req.userId, req.validatedParams.id, req.validatedBody) });
    });
  router.patch('/:id/complete', async (req, res) => {
    res.json({ success: true, data: { session: await service.complete(req.userId, req.validatedParams.id) } });
  });
  return router;
}
