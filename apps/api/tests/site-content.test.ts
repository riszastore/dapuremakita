import request from 'supertest';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth.js';
import { siteContentDefaults } from '../src/site-content.js';
import type { SafeUser, StoredUser, UserRepository } from '../src/types.js';

class Users implements UserRepository {
  private records: StoredUser[] = ['SUPER_ADMIN','CURATOR'].map((role) => ({ id: role.toLowerCase(), email: role.toLowerCase() + '@test.local', name: role, role: role as StoredUser['role'], passwordHash: bcrypt.hashSync('Demo123!', 4) }));
  findByEmail(email: string) { return Promise.resolve(this.records.find((item) => item.email === email) ?? null); }
  findById(id: string): Promise<SafeUser | null> { const user = this.records.find((item) => item.id === id); return Promise.resolve(user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null); }
}

const state: { content: any } = { content: null };
const prisma = {
  siteContent: {
    findUnique: async () => state.content,
    upsert: async ({ create, update }: any) => { state.content = state.content ? { ...state.content, ...update } : { ...create, createdAt: new Date(), updatedAt: new Date() }; return state.content; },
  },
  auditLog: { create: async () => ({ id: 'audit' }) },
} as unknown as PrismaClient;
const app = createApp(new AuthService(new Users()), undefined, prisma);
const ORIGIN = 'http://localhost:5173';

async function login(email: string) { const response = await request(app).post('/auth/login').set('Origin', ORIGIN).send({ email, password: 'Demo123!' }); return response.headers['set-cookie']?.[0] ?? ''; }

describe('site content CMS', () => {
  it('serves safe defaults publicly without authentication', async () => { state.content = null; const response = await request(app).get('/public/site-content'); expect(response.status).toBe(200); expect(response.body.content.heroTitle).toBe(siteContentDefaults.heroTitle); });
  it('allows only SUPER_ADMIN to read and update CMS content', async () => {
    state.content = null;
    const curator = await login('curator@test.local');
    expect((await request(app).get('/api/admin/site-content').set('Cookie', curator)).status).toBe(403);
    const admin = await login('super_admin@test.local');
    expect((await request(app).get('/api/admin/site-content').set('Cookie', admin)).status).toBe(200);
    const payload = Object.fromEntries(Object.entries(siteContentDefaults).filter(([key]) => key !== 'id'));
    const updated = await request(app).put('/api/admin/site-content').set('Cookie', admin).set('Origin', ORIGIN).send({ ...payload, heroTitle: 'Judul dari CMS' });
    expect(updated.status).toBe(200); expect(updated.body.content.heroTitle).toBe('Judul dari CMS');
    expect((await request(app).get('/public/site-content')).body.content.heroTitle).toBe('Judul dari CMS');
  });
});
