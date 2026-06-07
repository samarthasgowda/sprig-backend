import { z } from 'zod';

export const listProductsSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  storeId: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z.coerce.boolean().optional(),
  sort: z.enum(['popularity', 'price_asc', 'price_desc', 'rating', 'newest']).default('popularity'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListProductsQuery = z.infer<typeof listProductsSchema>;
