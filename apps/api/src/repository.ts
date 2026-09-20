import { PrismaClient, ProductStatus } from '@prisma/client';
import type { SafeUser, StoredUser, UserRepository } from './types.js';

const safe = (user: StoredUser): SafeUser => ({ id: user.id, email: user.email, name: user.name, role: user.role });

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByEmail(email: string): Promise<StoredUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? { ...user, role: user.role as StoredUser['role'] } : null;
  }
  async findById(id: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? safe({ ...user, role: user.role as StoredUser['role'] }) : null;
  }
}

export type CatalogQuery = { search?: string; category?: string; page: number; limit: number };
export type PublicProduct = { id: string; name: string; slug: string; price: number; description: string; imageUrl: string; category: { name: string; slug: string }; partner: { name: string; slug: string } | null };
export type CatalogRepository = {
  listCategories(): Promise<{ name: string; slug: string }[]>;
  listProducts(query: CatalogQuery): Promise<{ items: PublicProduct[]; total: number }>;
  findProduct(slug: string): Promise<PublicProduct | null>;
  listPartners(): Promise<{ name: string; slug: string; description: string; websiteUrl: string | null }[]>;
};

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async listCategories() { return this.prisma.category.findMany({ orderBy: { name: 'asc' }, select: { name: true, slug: true } }); }
  async listProducts(query: CatalogQuery) {
    const where = { status: ProductStatus.ACTIVE, ...(query.category ? { category: { slug: query.category } } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { description: { contains: query.search, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, select: { id: true, name: true, slug: true, price: true, description: true, imageUrl: true, category: { select: { name: true, slug: true } }, partner: { select: { name: true, slug: true } } }, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.product.count({ where })
    ]);
    return { items, total };
  }
  async findProduct(slug: string) { return this.prisma.product.findFirst({ where: { slug, status: ProductStatus.ACTIVE }, select: { id: true, name: true, slug: true, price: true, description: true, imageUrl: true, category: { select: { name: true, slug: true } }, partner: { select: { name: true, slug: true } } } }); }
  async listPartners() { return this.prisma.partner.findMany({ orderBy: { name: 'asc' }, select: { name: true, slug: true, description: true, websiteUrl: true } }); }
}
