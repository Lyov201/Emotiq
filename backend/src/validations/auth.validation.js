import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(255).pipe(z.email());

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  email,
  password: z.string().min(12).max(128),
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});
