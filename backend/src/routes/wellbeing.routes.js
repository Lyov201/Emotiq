import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createWellbeingService } from '../services/wellbeing.service.js';
import { createWellbeingController } from '../controllers/wellbeing.controller.js';
import { entryIdSchema, listEntriesSchema, createMoodSchema, updateMoodSchema, createJournalSchema, updateJournalSchema } from '../validations/wellbeing.validation.js';

export function createWellbeingRouter(db, kind) {
  const router = Router();
  const controller = createWellbeingController(createWellbeingService(db, kind));
  const [createSchema, updateSchema] = kind === 'mood' ? [createMoodSchema, updateMoodSchema] : [createJournalSchema, updateJournalSchema];
  router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' } }));
  router.post('/', validate(createSchema), controller.create);
  router.get('/', validate(listEntriesSchema, 'query'), controller.list);
  router.use('/:id', validate(entryIdSchema, 'params'));
  router.get('/:id', controller.get);
  router.patch('/:id', validate(updateSchema), controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
