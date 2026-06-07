import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { badRequest, forbidden, notFound } from '../../utils/AppError';
import { logger } from '../../lib/logger';

// Create a provider payment intent for an order. The provider SDK calls are
// stubbed with clear TODOs; when keys are absent we return a test-mode payload
// so the client integration can be built end-to-end before going live.
export async function createIntent(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order) throw notFound('Order not found');
  if (order.customerId !== userId) throw forbidden();
  if (!order.payment) throw badRequest('No payment record for this order');

  const amount = Number(order.payment.amount);
  if (order.payment.method === 'COD') return { provider: 'COD', cod: true, amount };

  if (order.payment.provider === 'RAZORPAY') {
    // TODO: const rzp = new Razorpay({ key_id, key_secret });
    //       const rzpOrder = await rzp.orders.create({ amount: amount*100, currency:'INR', receipt: order.orderNumber });
    const providerOrderId = env.RAZORPAY_KEY_ID
      ? `order_${crypto.randomBytes(8).toString('hex')}` // replace with rzpOrder.id
      : `test_order_${crypto.randomBytes(6).toString('hex')}`;
    await prisma.payment.update({ where: { id: order.payment.id }, data: { providerOrderId } });
    return { provider: 'RAZORPAY', providerOrderId, amount, currency: 'INR', keyId: env.RAZORPAY_KEY_ID ?? 'test_key' };
  }

  // STRIPE
  // TODO: const pi = await stripe.paymentIntents.create({ amount: amount*100, currency:'inr' });
  const clientSecret = `pi_${crypto.randomBytes(8).toString('hex')}_secret_test`;
  await prisma.payment.update({ where: { id: order.payment.id }, data: { providerOrderId: clientSecret.split('_secret')[0] } });
  return { provider: 'STRIPE', clientSecret, amount, currency: 'INR' };
}

// Razorpay sends an HMAC-SHA256 signature over the raw body keyed by the
// webhook secret. Verify it before trusting the event.
export async function handleRazorpayWebhook(signature: string | undefined, rawBody: Buffer) {
  if (env.RAZORPAY_WEBHOOK_SECRET) {
    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    if (expected !== signature) throw badRequest('Invalid webhook signature');
  }
  const event = JSON.parse(rawBody.toString('utf8'));
  const entity = event?.payload?.payment?.entity;
  if (event?.event === 'payment.captured' && entity?.order_id) {
    await prisma.payment.updateMany({
      where: { providerOrderId: entity.order_id },
      data: { status: 'PAID', providerPaymentId: entity.id, capturedAt: new Date(), raw: event },
    });
    logger.info({ orderId: entity.order_id }, 'razorpay payment captured');
  }
  return { received: true };
}

// Stripe verification normally uses stripe.webhooks.constructEvent with the
// signing secret. Stubbed here; wire the SDK in production.
export async function handleStripeWebhook(_signature: string | undefined, rawBody: Buffer) {
  // TODO: const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  const event = JSON.parse(rawBody.toString('utf8'));
  if (event?.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    await prisma.payment.updateMany({
      where: { providerOrderId: pi.id },
      data: { status: 'PAID', providerPaymentId: pi.id, capturedAt: new Date(), raw: event },
    });
  }
  return { received: true };
}
