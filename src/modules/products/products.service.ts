import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../utils/AppError';
import type { ListProductsQuery } from './products.schema';

export async function listProducts(q: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.brand) where.brand = { contains: q.brand, mode: 'insensitive' };
  if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
  if (q.minRating !== undefined) where.rating = { gte: q.minRating };

  // Price / availability live on variants + inventory.
  const variantFilter: Prisma.ProductVariantWhereInput = {};
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    variantFilter.price = {
      ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
    };
  }
  if (q.inStock || q.storeId) {
    variantFilter.inventory = {
      some: {
        ...(q.storeId ? { storeId: q.storeId } : {}),
        isAvailable: true,
        ...(q.inStock ? { stock: { gt: 0 } } : {}),
      },
    };
  }
  if (Object.keys(variantFilter).length) where.variants = { some: variantFilter };

  // Prisma can't orderBy a related min(price); do DB sort for the rest,
  // and sort price_asc/desc in memory after fetching the page set.
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    q.sort === 'rating' ? { rating: 'desc' }
    : q.sort === 'newest' ? { createdAt: 'desc' }
    : { ratingCount: 'desc' }; // popularity

  const [rows, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { variants: { orderBy: { price: 'asc' } }, category: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.product.count({ where }),
  ]);

  const items = rows.map((p) => ({ ...p, minPrice: p.variants[0] ? Number(p.variants[0].price) : null }));
  if (q.sort === 'price_asc') items.sort((a, b) => (a.minPrice ?? 1e9) - (b.minPrice ?? 1e9));
  if (q.sort === 'price_desc') items.sort((a, b) => (b.minPrice ?? -1) - (a.minPrice ?? -1));

  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: { include: { inventory: true } },
      category: true,
      reviews: { take: 10, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!product) throw notFound('Product not found');
  return product;
}
