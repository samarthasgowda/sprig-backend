import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import * as c from './auth.controller';
import {
  registerSchema, loginSchema, otpRequestSchema, otpVerifySchema, refreshSchema,
} from './auth.schema';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), c.registerCtrl);
router.post('/login', authLimiter, validate(loginSchema), c.loginCtrl);
router.post('/otp/request', authLimiter, validate(otpRequestSchema), c.otpRequestCtrl);
router.post('/otp/verify', authLimiter, validate(otpVerifySchema), c.otpVerifyCtrl);
router.post('/refresh', validate(refreshSchema), c.refreshCtrl);
router.post('/logout', validate(refreshSchema), c.logoutCtrl);
router.get('/me', authenticate, c.meCtrl);

export default router;
