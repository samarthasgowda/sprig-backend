import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../utils/AppError';

const include = { items: { include: { variant: { include: { product: true } } } } } as const;

export async function getCart(userId: string) {
  return prisma.cart.upsert({ where: { userId }, create: { userId }, update: {}, include });
}

export async function addItem(userId: string, input: { variantId: string; storeId: string; quantity: number }) {
  const cart = await prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });

  // A cart is scoped to one store at a time (quick-commerce model).
  if (cart.storeId && cart.storeId !== input.storeId) {
    throw conflict('Your cart has items from another store. Clear it to switch stores.');
  }
  if (!cart.storeId) await prisma.cart.update({ where: { id: cart.id }, data: { storeId: input.storeId } });

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    create: { cartId: cart.id, variantId: input.variantId, storeId: input.storeId, quantity: input.quantity },
    update: { quantity: { increment: input.quantity } },
  });
  return getCart(userId);
}

export async function updateItem(userId: string, itemId: string, quantity: number) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
  if (!item) throw notFound('Cart item not found');
  if (quantity === 0) await prisma.cartItem.delete({ where: { id: itemId } });
  else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  return getCart(userId);
}

export async function removeItem(userId: string, itemId: string) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
  if (!item) throw notFound('Cart item not found');
  await prisma.cartItem.delete({ where: { id: itemId } });
  return getCart(userId);
}

export async function clearCart(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.update({ where: { id: cart.id }, data: { storeId: null } });
  }
  return getCart(userId);
}
