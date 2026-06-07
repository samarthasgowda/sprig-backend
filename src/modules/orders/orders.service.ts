import crypto from 'crypto';
import { Prisma, OrderStatus, PaymentMethod, PaymentProvider, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError';
import { emitToStore, emitToOrder, emitToUser } from '../../realtime/socket';

// Pricing rules (rupees). NOTE: for real money use integer minor units (paise)
// end-to-end; floats are used here for readability in the scaffold.
const FREE_DELIVERY_OVER = 199;
const DELIVERY_FEE = 25;
const HANDLING_FEE = 4;
const GST_RATE = 0.05;
const round2 = (n: number) => Math.round(n * 100) / 100;

const orderNumber = () =>
  'SP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();

const providerFor = (m: PaymentMethod): PaymentProvider =>
  m === 'COD' ? 'COD' : m === 'WALLET' ? 'WALLET' : 'RAZORPAY';

const orderInclude = {
  items: true,
  payment: true,
  statusEvents: { orderBy: { createdAt: 'asc' } },
  store: { select: { id: true, name: true, lat: true, lng: true } },
  deliveryPartner: { select: { id: true, currentLat: true, currentLng: true, user: { select: { name: true, phone: true } } } },
} satisfies Prisma.OrderInclude;

async function resolveCoupon(
  tx: Prisma.TransactionClient,
  code: string | undefined,
  userId: string,
  itemTotal: number,
): Promise<{ couponId: string | null; itemsDiscount: number; freeDelivery: boolean }> {
  if (!code) return { couponId: null, itemsDiscount: 0, freeDelivery: false };
  const coupon = await tx.coupon.findUnique({ where: { code } });
  const now = new Date();
  if (
    !coupon || !coupon.isActive ||
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.expiresAt && coupon.expiresAt < now)
  ) throw badRequest('Coupon is not valid');
  if (coupon.minOrder && itemTotal < Number(coupon.minOrder)) {
    throw badRequest(`Minimum order of ₹${coupon.minOrder} required for this coupon`);
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw badRequest('Coupon usage limit reached');
  const used = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId } });
  if (used >= coupon.perUserLimit) throw badRequest('Coupon already used');

  let itemsDiscount = 0;
  let freeDelivery = false;
  if (coupon.type === 'PERCENT') itemsDiscount = (itemTotal * Number(coupon.value)) / 100;
  else if (coupon.type === 'FLAT') itemsDiscount = Number(coupon.value);
  else if (coupon.type === 'FREE_DELIVERY') freeDelivery = true;
  if (coupon.maxDiscount) itemsDiscount = Math.min(itemsDiscount, Number(coupon.maxDiscount));
  return { couponId: coupon.id, itemsDiscount: round2(Math.min(itemsDiscount, itemTotal)), freeDelivery };
}

export async function createFromCart(
  userId: string,
  input: { addressId: string; paymentMethod: PaymentMethod; couponCode?: string; instructions?: string },
) {
  const order = await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: { items: { include: { variant: true } } },
    });
    if (!cart || cart.items.length === 0) throw badRequest('Your cart is empty');
    const storeId = cart.storeId!;

    const address = await tx.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw notFound('Delivery address not found');

    // Validate stock for every line against this store's inventory.
    const variantIds = cart.items.map((i) => i.variantId);
    const inv = await tx.inventory.findMany({ where: { storeId, variantId: { in: variantIds } } });
    const invByVariant = new Map(inv.map((i) => [i.variantId, i]));

    let itemTotal = 0;
    const lineData = cart.items.map((it) => {
      const stock = invByVariant.get(it.variantId);
      if (!stock || !stock.isAvailable || stock.stock < it.quantity) {
        throw conflict(`"${it.variant.name}" is out of stock`);
      }
      const unitPrice = Number(stock.priceOverride ?? it.variant.price);
      const total = round2(unitPrice * it.quantity);
      itemTotal += total;
      return {
        variantId: it.variantId,
        productName: '', // filled after we fetch product names below
        variantName: it.variant.name,
        quantity: it.quantity,
        unitPrice,
        mrp: Number(it.variant.mrp),
        total,
      };
    });
    itemTotal = round2(itemTotal);

    // Snapshot product names for the order lines.
    const products = await tx.product.findMany({
      where: { variants: { some: { id: { in: variantIds } } } },
      select: { name: true, variants: { select: { id: true } } },
    });
    const nameByVariant = new Map<string, string>();
    for (const p of products) for (const v of p.variants) nameByVariant.set(v.id, p.name);
    lineData.forEach((l) => (l.productName = nameByVariant.get(l.variantId) ?? l.variantName));

    const { couponId, itemsDiscount, freeDelivery } = await resolveCoupon(tx, input.couponCode, userId, itemTotal);
    const deliveryFee = freeDelivery || itemTotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
    const taxes = round2((itemTotal - itemsDiscount) * GST_RATE);
    const grandTotal = round2(itemTotal - itemsDiscount + deliveryFee + HANDLING_FEE + taxes);

    // Reserve stock by decrementing on hand.
    for (const it of cart.items) {
      await tx.inventory.update({
        where: { storeId_variantId: { storeId, variantId: it.variantId } },
        data: { stock: { decrement: it.quantity } },
      });
    }

    const created = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        customerId: userId,
        storeId,
        addressId: address.id,
        addressLine: [address.line1, address.line2, address.city, address.pincode].filter(Boolean).join(', '),
        addressLat: address.lat,
        addressLng: address.lng,
        instructions: input.instructions,
        status: 'PLACED',
        itemTotal,
        discount: itemsDiscount,
        deliveryFee,
        handlingFee: HANDLING_FEE,
        taxes,
        grandTotal,
        couponId,
        etaMinutes: 11,
        items: { create: lineData },
        statusEvents: { create: { status: 'PLACED', note: 'Order placed' } },
        payment: {
          create: {
            provider: providerFor(input.paymentMethod),
            method: input.paymentMethod,
            amount: grandTotal,
            status: input.paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
          },
        },
      },
      include: orderInclude,
    });

    if (couponId) {
      await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
      await tx.couponRedemption.create({ data: { couponId, userId, orderId: created.id, discount: itemsDiscount } });
    }

    // Empty the cart.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { storeId: null } });

    return created;
  });

  // Notify the store dashboard in real time (outside the transaction).
  emitToStore(order.storeId, 'order:new', { orderId: order.id, orderNumber: order.orderNumber, total: order.grandTotal });
  return order;
}

export async function updateStatus(
  orderId: string,
  actor: { id: string; role: UserRole },
  data: { status: OrderStatus; note?: string; lat?: number; lng?: number },
) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true, deliveryPartner: true } });
  if (!order) throw notFound('Order not found');

  // Authorization: store owner of this store, the assigned partner, or staff.
  const isStaff = actor.role === 'ADMIN' || actor.role === 'SUPPORT';
  const isStoreOwner = actor.role === 'STORE_OWNER' && order.store.ownerId === actor.id;
  const isPartner = actor.role === 'DELIVERY_PARTNER' && order.deliveryPartner?.userId === actor.id;
  if (!isStaff && !isStoreOwner && !isPartner) throw forbidden('Not allowed to update this order');

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: data.status,
      deliveredAt: data.status === 'DELIVERED' ? new Date() : undefined,
      statusEvents: { create: { status: data.status, note: data.note, lat: data.lat, lng: data.lng } },
    },
    include: orderInclude,
  });

  // Push the update to anyone tracking this order + the customer.
  emitToOrder(orderId, 'order:update', { status: updated.status, at: new Date().toISOString() });
  emitToUser(order.customerId, 'order:update', { orderId, status: updated.status });
  return updated;
}

export async function getOrder(orderId: string, actor: { id: string; role: UserRole }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw notFound('Order not found');
  const isStaff = actor.role === 'ADMIN' || actor.role === 'SUPPORT';
  if (!isStaff && order.customerId !== actor.id) {
    // store owners / partners check via their linked records
    const owned = await prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [{ store: { ownerId: actor.id } }, { deliveryPartner: { userId: actor.id } }],
      },
      select: { id: true },
    });
    if (!owned) throw forbidden('Not allowed to view this order');
  }
  return order;
}

export async function listOrders(
  actor: { id: string; role: UserRole },
  q: { status?: string; page: number; pageSize: number },
) {
  const where: Prisma.OrderWhereInput = {};
  if (q.status) where.status = q.status as OrderStatus;
  if (actor.role === 'CUSTOMER') where.customerId = actor.id;
  else if (actor.role === 'STORE_OWNER') where.store = { ownerId: actor.id };
  else if (actor.role === 'DELIVERY_PARTNER') where.deliveryPartner = { userId: actor.id };
  // ADMIN / SUPPORT: no restriction

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { items: true, payment: { select: { status: true, method: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
}
