import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(8).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const otpRequestSchema = z.object({ phone: z.string().min(8) });

export const otpVerifySchema = z.object({
  phone: z.string().min(8),
  code: z.string().length(6),
  name: z.string().optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
