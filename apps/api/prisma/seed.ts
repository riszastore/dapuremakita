import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? '../../.env' });
if (process.env.NODE_ENV === 'production') throw new Error('Seed is disabled in production');

const prisma = new PrismaClient();
const password = 'Demo123!';
const users = [
  ['superadmin@dapuremakita.local', 'Super Admin', Role.SUPER_ADMIN],
  ['curator@dapuremakita.local', 'Curator Demo', Role.CURATOR],
  ['operations@dapuremakita.local', 'Operations Demo', Role.OPERATIONS],
  ['partner@dapuremakita.local', 'Partner Demo', Role.PARTNER],
  ['customer@dapuremakita.local', 'Customer Demo', Role.CUSTOMER],
  ['nazhir@dapuremakita.local', 'Nazhir Viewer Demo', Role.NAZHIR_VIEWER]
] as const;

const passwordHash = await bcrypt.hash(password, 12);
for (const [email, name, role] of users) {
  await prisma.user.upsert({ where: { email }, update: { name, role, passwordHash }, create: { email, name, role, passwordHash } });
}
await prisma.$disconnect();
console.log(`Seeded ${users.length} users. Local password: ${password}`);
