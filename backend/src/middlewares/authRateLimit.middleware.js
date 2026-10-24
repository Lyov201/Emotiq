import { rateLimit } from 'express-rate-limit';

const limiter = limit => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// New instances per app; production limits also remain active during tests.
export const createAuthRateLimits = () => ({
  register: limiter(10),
  login: limiter(20),
  refresh: limiter(60),
  logout: limiter(60),
  me: limiter(120),
});
