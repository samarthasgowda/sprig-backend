import { z } from 'zod';
export const createIntentSchema = z.object({ orderId: z.string() });
