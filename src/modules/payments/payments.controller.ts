import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as svc from './payments.service';

export const createIntentCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.createIntent(req.body.orderId, req.user!.id));
});

export const razorpayWebhookCtrl = asyncHandler(async (req: Request, res: Response) => {
  const sig = req.headers['x-razorpay-signature'] as string | undefined;
  res.json(await svc.handleRazorpayWebhook(sig, (req as unknown as { rawBody: Buffer }).rawBody));
});

export const stripeWebhookCtrl = asyncHandler(async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  res.json(await svc.handleStripeWebhook(sig, (req as unknown as { rawBody: Buffer }).rawBody));
});
