import { PrismaClient, ProductStatus, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? new URL('../../../.env', import.meta.url).pathname });
if (process.env.NODE_ENV === 'production') throw new Error('Seed is disabled in production');

const prisma = new PrismaClient();
const password = 'Demo123!';
const users = [
  ['superadmin@dapuremakita.local', 'Super Admin', Role.SUPER_ADMIN],
  ['curator@dapuremakita.local', 'Curator Demo', Role.CURATOR],
  ['operations@dapuremakita.local', 'Operations Demo', Role.OPERATIONS],
  ['partner@dapuremakita.local', 'Partner Demo', Role.PARTNER],
  ['partner.two@dapuremakita.local', 'Partner Dua Demo', Role.PARTNER],
  ['customer@dapuremakita.local', 'Customer Demo', Role.CUSTOMER],
  ['nazhir@dapuremakita.local', 'Nazhir Viewer Demo', Role.NAZHIR_VIEWER]
] as const;

const passwordHash = await bcrypt.hash(password, 12);
for (const [email, name, role] of users) {
  await prisma.user.upsert({ where: { email }, update: { name, role, passwordHash }, create: { email, name, role, passwordHash } });
}
const categories = await Promise.all([
  prisma.category.upsert({ where: { slug: 'pangan' }, update: { name: 'Pangan' }, create: { name: 'Pangan', slug: 'pangan' } }),
  prisma.category.upsert({ where: { slug: 'rumah' }, update: { name: 'Rumah & Gaya Hidup' }, create: { name: 'Rumah & Gaya Hidup', slug: 'rumah' } })
]);
const partnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'partner@dapuremakita.local' } });
const secondPartnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'partner.two@dapuremakita.local' } });
const partner = await prisma.partner.upsert({ where: { slug: 'dapur-ibu-nusantara' }, update: { userId: partnerUser.id }, create: { name: 'Dapur Ibu Nusantara', slug: 'dapur-ibu-nusantara', description: 'Kolektif pengolah pangan rumahan yang tumbuh bersama kurasi dan pendampingan.', websiteUrl: null, userId: partnerUser.id } });
const secondPartner = await prisma.partner.upsert({ where: { slug: 'kelompok-pagi-sejahtera' }, update: { userId: secondPartnerUser.id }, create: { name: 'Kelompok Pagi Sejahtera', slug: 'kelompok-pagi-sejahtera', description: 'Mitra kedua untuk verifikasi isolasi tenant.', websiteUrl: null, userId: secondPartnerUser.id } });
await prisma.partnerProfile.upsert({ where: { partnerId: partner.id }, update: {}, create: { partnerId: partner.id, contactName: 'Partner Demo', phone: '081234567890', address: 'Jl. Nusantara 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' } });
await prisma.partnerProfile.upsert({ where: { partnerId: secondPartner.id }, update: {}, create: { partnerId: secondPartner.id, contactName: 'Partner Dua Demo', phone: '081234567891', address: 'Jl. Pagi 2', city: 'Bogor', province: 'Jawa Barat', postalCode: '16111' } });
const products = [
  { name: 'Sambal Kecombrang', slug: 'sambal-kecombrang', price: 38000, description: 'Sambal segar dengan kecombrang pilihan, dibuat dalam batch kecil.', imageUrl: '/images/sambal-kecombrang.jpg', status: ProductStatus.ACTIVE, categoryId: categories[0].id, partnerId: partner.id },
  { name: 'Granola Kelapa Jawa', slug: 'granola-kelapa-jawa', price: 65000, description: 'Granola renyah dengan kelapa dan gula kelapa dari kebun mitra.', imageUrl: '/images/granola-kelapa.jpg', status: ProductStatus.ACTIVE, categoryId: categories[0].id, partnerId: partner.id },
  { name: 'Keranjang Anyam Pagi', slug: 'keranjang-anyam-pagi', price: 145000, description: 'Keranjang serbaguna dari perajin lokal, ringan dan tahan lama.', imageUrl: '/images/keranjang-anyam.jpg', status: ProductStatus.ACTIVE, categoryId: categories[1].id, partnerId: partner.id },
  { name: 'Teh Rempah Draft', slug: 'teh-rempah-draft', price: 42000, description: 'Produk yang masih dalam proses kurasi.', imageUrl: '/images/teh-rempah.jpg', status: ProductStatus.DRAFT, categoryId: categories[0].id, partnerId: partner.id }
];
for (const product of products) await prisma.product.upsert({ where: { slug: product.slug }, update: product, create: product });
await prisma.$disconnect();
console.log(`Seeded ${users.length} users and ${products.length} products. Local password: ${password}`);
