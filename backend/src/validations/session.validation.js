import { z } from 'zod';
export const startSessionSchema = z.strictObject({ bookingId: z.uuid() });
export const sessionIdSchema = z.strictObject({ id: z.uuid() });
export const sendMessageSchema = z.strictObject({ content: z.string().trim().min(1).max(4000) });
export const sessionPageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
