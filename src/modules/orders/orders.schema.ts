import { z } from 'zod';

export const createOrderSchema = z.object({
  addressId: z.string(),
  paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET', 'COD']),
  couponCode: z.string().optional(),
  instructions: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum([
    'PLACED', 'ACCEPTED', 'PACKING', 'READY_FOR_PICKUP', 'PARTNER_ASSIGNED',
    'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED',
  ]),
  note: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export const listOrdersSchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
