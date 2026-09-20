import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { CatalogRepository, PublicProduct } from '../src/repository.js';
import type { UserRepository, SafeUser, StoredUser } from '../src/types.js';
import { AuthService } from '../src/services/auth.js';

const category = { name: 'Pangan', slug: 'pangan' };
const secondCategory = { name: 'Rumah & Gaya Hidup', slug: 'rumah' };
const active: PublicProduct = { id: '1', name: 'Sambal Kecombrang', slug: 'sambal-kecombrang', price: 38000, description: 'Sambal segar', imageUrl: '/images/sambal.jpg', category, partner: null };
const secondActive: PublicProduct = { id: '2', name: 'Keranjang Anyam Pagi', slug: 'keranjang-anyam-pagi', price: 145000, description: 'Keranjang lokal', imageUrl: '/images/keranjang.jpg', category: secondCategory, partner: { name: 'Mitra Pagi', slug: 'mitra-pagi' } };
const catalog: CatalogRepository = {
  listCategories: async () => [category, secondCategory],
  listProducts: async (query) => { const filtered = [active, secondActive].filter((product) => product.name.toLowerCase().includes((query.search ?? '').toLowerCase()) && (!query.category || query.category === product.category.slug)); return { items: filtered.slice((query.page - 1) * query.limit, query.page * query.limit), total: filtered.length }; },
  findProduct: async (slug) => slug === active.slug ? active : null,
  listPartners: async () => [{ name: 'Mitra Pagi', slug: 'mitra-pagi', description: 'Mitra lokal', websiteUrl: null }]
};
const users: UserRepository = { findByEmail: async (): Promise<StoredUser | null> => null, findById: async (): Promise<SafeUser | null> => null };
const app = createApp(new AuthService(users), catalog);

describe('public catalog ACTIVE contract', () => {
  it('lists categories and public active products with pagination metadata', async () => { const response = await request(app).get('/public/products?page=1&limit=1'); expect(response.status).toBe(200); expect(response.body.items[0].slug).toBe('sambal-kecombrang'); expect(response.body.totalPages).toBe(2); expect((await request(app).get('/public/products?page=2&limit=1')).body.items[0].slug).toBe('keranjang-anyam-pagi'); expect((await request(app).get('/public/categories')).body.categories).toEqual([category, secondCategory]); });
  it('applies search and category filters', async () => { expect((await request(app).get('/public/products?search=kecombrang')).body.items).toHaveLength(1); expect((await request(app).get('/public/products?search=tidak-ada')).body.items).toHaveLength(0); expect((await request(app).get('/public/products?category=rumah')).body.items[0].slug).toBe('keranjang-anyam-pagi'); });
  it('rejects invalid query values', async () => { const response = await request(app).get('/public/products?page=0&limit=99'); expect(response.status).toBe(400); expect(response.body.error).toBe('Invalid request'); });
  it('returns active detail and hides non-active or missing slugs', async () => { expect((await request(app).get('/public/products/sambal-kecombrang')).status).toBe(200); expect((await request(app).get('/public/products/teh-rempah-draft')).status).toBe(404); expect((await request(app).get('/public/products/does-not-exist')).status).toBe(404); });
  it('returns partner data publicly and keeps auth endpoints protected', async () => { const partners = await request(app).get('/public/partners'); expect(partners.status).toBe(200); expect(partners.body.partners[0].slug).toBe('mitra-pagi'); expect((await request(app).get('/api/admin/overview')).status).toBe(401); });
});
