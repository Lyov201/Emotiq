import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createBookingController } from '../controllers/booking.controller.js';
import { createBookingService } from '../services/booking.service.js';
import { createBookingSchema, bookingIdSchema, availabilitySchema, listBookingsSchema } from '../validations/booking.validation.js';

export function createBookingRouter(db) {
  const router = Router();
  const controller = createBookingController(createBookingService(db));
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many booking requests. Please try again later.' } }));
  router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/availability', validate(availabilitySchema, 'query'), controller.availability);
  router.post('/', validate(createBookingSchema), controller.create);
  router.get('/', validate(listBookingsSchema, 'query'), controller.list);
  router.get('/:id', validate(bookingIdSchema, 'params'), controller.get);
  router.patch('/:id/cancel', validate(bookingIdSchema, 'params'), controller.cancel);
  return router;
}
