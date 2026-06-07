import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter limiter for auth endpoints to slow brute-force / OTP abuse.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try later.' } },
});
