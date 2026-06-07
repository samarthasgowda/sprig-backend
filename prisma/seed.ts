import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Users ──────────────────────────────────────────────
  const password = await bcrypt.hash('Password123', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@sprig.dev' },
    update: {},
    create: { name: 'Store Owner', email: 'owner@sprig.dev', passwordHash: password, role: 'STORE_OWNER' },
  });

  await prisma.user.upsert({
    where: { email: 'customer@sprig.dev' },
    update: {},
    create: {
      name: 'Test Customer', email: 'customer@sprig.dev', passwordHash: password, role: 'CUSTOMER',
      wallet: { create: { balance: 500 } },
      addresses: { create: { line1: '12 MG Road', city: 'Bengaluru', pincode: '560001', lat: 12.9716, lng: 77.5946, isDefault: true } },
    },
  });

  const riderUser = await prisma.user.upsert({
    where: { email: 'rider@sprig.dev' },
    update: {},
    create: { name: 'Test Rider', email: 'rider@sprig.dev', passwordHash: password, role: 'DELIVERY_PARTNER' },
  });
  await prisma.deliveryPartner.upsert({
    where: { userId: riderUser.id },
    update: {},
    create: { userId: riderUser.id, vehicleType: 'bike', kycStatus: 'VERIFIED', status: 'ONLINE', isAvailable: true },
  });

  // ── Store ──────────────────────────────────────────────
  const store = await prisma.store.upsert({
    where: { slug: 'sprig-central' },
    update: {},
    create: {
      ownerId: owner.id, name: 'Sprig Central', slug: 'sprig-central', status: 'ACTIVE',
      city: 'Bengaluru', pincode: '560001', lat: 12.9716, lng: 77.5946, prepTimeMinutes: 6,
    },
  });

  // ── Categories ─────────────────────────────────────────
  const cats = ['Fruits & Vegetables', 'Dairy & Bread', 'Snacks', 'Beverages', 'Staples'];
  const categories: Record<string, string> = {};
  for (const [i, name] of cats.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    const c = await prisma.category.upsert({
      where: { slug }, update: {}, create: { name, slug, sortOrder: i },
    });
    categories[name] = c.id;
  }

  // ── Products + variants + inventory ────────────────────
  const seed = [
    { name: 'Bananas (Robusta)', cat: 'Fruits & Vegetables', unit: '500 g', mrp: 50, price: 39 },
    { name: 'Farm Tomatoes', cat: 'Fruits & Vegetables', unit: '500 g', mrp: 40, price: 29 },
    { name: 'Full Cream Milk', cat: 'Dairy & Bread', unit: '500 ml', mrp: 35, price: 33 },
    { name: 'Brown Bread', cat: 'Dairy & Bread', unit: '400 g', mrp: 50, price: 45 },
    { name: 'Potato Chips', cat: 'Snacks', unit: '52 g', mrp: 20, price: 18 },
    { name: 'Dark Chocolate', cat: 'Snacks', unit: '80 g', mrp: 120, price: 99 },
    { name: 'Cola Can', cat: 'Beverages', unit: '300 ml', mrp: 40, price: 35 },
    { name: 'Basmati Rice', cat: 'Staples', unit: '1 kg', mrp: 150, price: 129 },
  ];

  for (const [i, p] of seed.entries()) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const product = await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        name: p.name, slug, brand: 'Sprig', unit: p.unit, categoryId: categories[p.cat],
        isBestSeller: i < 3, rating: 4.2 + (i % 5) * 0.1, ratingCount: 50 + i * 7,
        variants: { create: { sku: `SKU-${slug}`, name: p.unit, mrp: p.mrp, price: p.price } },
      },
      include: { variants: true },
    });
    const variant = product.variants[0];
    await prisma.inventory.upsert({
      where: { storeId_variantId: { storeId: store.id, variantId: variant.id } },
      update: { stock: 100 },
      create: { storeId: store.id, variantId: variant.id, stock: 100, isAvailable: true },
    });
  }

  // ── A coupon ───────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { code: 'FRESH50' },
    update: {},
    create: { code: 'FRESH50', type: 'FLAT', value: 50, minOrder: 199, description: '₹50 off over ₹199' },
  });

  console.log('✅ Seed complete. Logins: owner@ / customer@ / rider@sprig.dev  (Password123)');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
