import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createIntentSchema } from './payments.schema';
import * as c from './payments.controller';

const router = Router();
router.post('/intent', authenticate, validate(createIntentSchema), c.createIntentCtrl);
// Webhooks are unauthenticated but signature-verified.
router.post('/webhook/razorpay', c.razorpayWebhookCtrl);
router.post('/webhook/stripe', c.stripeWebhookCtrl);
export default router;
