import { z } from 'zod';

export const addItemSchema = z.object({
  variantId: z.string(),
  storeId: z.string(),
  quantity: z.coerce.number().int().min(1).default(1),
});

export const updateItemSchema = z.object({
  quantity: z.coerce.number().int().min(0),
});
