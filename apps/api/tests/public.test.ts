import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { CatalogRepository, PublicProduct } from '../src/repository.js';
import type { UserRepository, SafeUser, StoredUser } from '../src/types.js';
import { AuthService } from '../src/services/auth.js';

const category = { name: 'Pangan', slug: 'pangan' };
const active: PublicProduct = { id: '1', name: 'Sambal Kecombrang', slug: 'sambal-kecombrang', price: 38000, description: 'Sambal segar', imageUrl: '/images/sambal.jpg', category, partner: null };
const catalog: CatalogRepository = {
  listCategories: async () => [category],
  listProducts: async (query) => { const filtered = active.name.toLowerCase().includes((query.search ?? '').toLowerCase()) && (!query.category || query.category === category.slug) ? [active] : []; return { items: filtered.slice((query.page - 1) * query.limit, query.page * query.limit), total: filtered.length }; },
  findProduct: async (slug) => slug === active.slug ? active : null,
  listPartners: async () => []
};
const users: UserRepository = { findByEmail: async (): Promise<StoredUser | null> => null, findById: async (): Promise<SafeUser | null> => null };
const app = createApp(new AuthService(users), catalog);

describe('public catalog ACTIVE contract', () => {
  it('lists categories and public active products with pagination metadata', async () => { const response = await request(app).get('/public/products?page=1&limit=1'); expect(response.status).toBe(200); expect(response.body.items[0].slug).toBe('sambal-kecombrang'); expect(response.body.totalPages).toBe(1); expect((await request(app).get('/public/categories')).body.categories).toEqual([category]); });
  it('applies search and category filters', async () => { expect((await request(app).get('/public/products?search=kecombrang')).body.items).toHaveLength(1); expect((await request(app).get('/public/products?search=tidak-ada')).body.items).toHaveLength(0); expect((await request(app).get('/public/products?category=rumah')).body.items).toHaveLength(0); });
  it('rejects invalid query values', async () => { const response = await request(app).get('/public/products?page=0&limit=99'); expect(response.status).toBe(400); expect(response.body.error).toBe('Invalid request'); });
  it('returns active detail and hides non-active or missing slugs', async () => { expect((await request(app).get('/public/products/sambal-kecombrang')).status).toBe(200); expect((await request(app).get('/public/products/teh-rempah-draft')).status).toBe(404); expect((await request(app).get('/public/products/does-not-exist')).status).toBe(404); });
  it('keeps public reads anonymous and auth endpoints available', async () => { expect((await request(app).get('/public/partners')).status).toBe(200); expect((await request(app).get('/api/admin/overview')).status).toBe(401); });
});
