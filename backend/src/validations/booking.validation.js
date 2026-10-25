import { z } from 'zod';

export const createBookingSchema = z.strictObject({ startTime: z.iso.datetime({ offset: true }) });
export const bookingIdSchema = z.strictObject({ id: z.uuid() });
export const availabilitySchema = z.strictObject({
  date: z.iso.date(),
  timezone: z.string().min(1).max(100).default('Asia/Yerevan').refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return !/^[+-]/.test(value); }
    catch { return false; }
  }, 'Use a valid IANA timezone'),
});
export const listBookingsSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED', 'MISSED']).optional(),
});
