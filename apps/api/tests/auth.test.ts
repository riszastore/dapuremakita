import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth.js';
import { config } from '../src/config.js';
import type { SafeUser, StoredUser, UserRepository } from '../src/types.js';

class MemoryUsers implements UserRepository {
  private readonly records: StoredUser[];
  constructor() {
    const roles = ['SUPER_ADMIN', 'CURATOR', 'OPERATIONS', 'PARTNER', 'CUSTOMER', 'NAZHIR_VIEWER'] as const;
    this.records = roles.map((role) => ({ id: role.toLowerCase(), email: `${role.toLowerCase()}@test.local`, name: role, role, passwordHash: bcrypt.hashSync('Demo123!', 4) }));
  }
  findByEmail(email: string) { return Promise.resolve(this.records.find((user) => user.email === email) ?? null); }
  findById(id: string): Promise<SafeUser | null> { const user = this.records.find((record) => record.id === id); return Promise.resolve(user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null); }
}
const ORIGIN = 'http://localhost:5173';
const makeApp = () => createApp(new AuthService(new MemoryUsers()));
const app = makeApp();
const login = (application: ReturnType<typeof makeApp>, email: string) => request(application).post('/auth/login').set('Origin', ORIGIN).send({ email, password: 'Demo123!' });
const cookieOf = (response: { headers: { 'set-cookie'?: string[] } }) => response.headers['set-cookie']?.[0];

describe('authentication and RBAC', () => {
  it('rejects invalid login payload and wrong password generically', async () => {
    const invalid = await request(app).post('/auth/login').set('Origin', ORIGIN).send({ email: 'bad', password: '' });
    const wrongPassword = await request(app).post('/auth/login').set('Origin', ORIGIN).send({ email: 'partner@test.local', password: 'wrong' });
    expect(invalid.status).toBe(400); expect(invalid.body.error).toBe('Invalid request');
    expect(wrongPassword.status).toBe(401); expect(wrongPassword.body.error).toBe('Invalid email or password');
  });
  it('requires same-origin state-changing requests', async () => { const response = await request(app).post('/auth/login').send({ email: 'partner@test.local', password: 'Demo123!' }); expect(response.status).toBe(403); });
  it('logs in successfully with HttpOnly cookie', async () => { const response = await login(app, 'partner@test.local'); expect(response.status).toBe(200); expect(response.body.user.role).toBe('PARTNER'); expect(cookieOf(response)).toContain('HttpOnly'); expect(cookieOf(response)).toContain('Max-Age=900'); });
  it('returns current user from me and clears the session on logout', async () => {
    const agent = request.agent(app);
    const loggedIn = await agent.post('/auth/login').set('Origin', ORIGIN).send({ email: 'customer@test.local', password: 'Demo123!' });
    const current = await agent.get('/auth/me');
    const loggedOut = await agent.post('/auth/logout').set('Origin', ORIGIN);
    const afterLogout = await agent.get('/auth/me');
    expect(loggedIn.status).toBe(200); expect(current.body.user.email).toBe('customer@test.local');
    expect(loggedOut.status).toBe(204); expect(loggedOut.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970'); expect(afterLogout.status).toBe(401);
  });
  it('rejects anonymous access', async () => { expect((await request(app).get('/api/admin/overview')).status).toBe(401); });
  it('allows and forbids every protected endpoint for all six roles', async () => {
    const matrixApp = makeApp();
    const endpoints = ['/api/admin/overview', '/api/partner/overview', '/api/nazhir/overview'];
    const allowed: Record<string, string[]> = { SUPER_ADMIN: [endpoints[0]], CURATOR: [endpoints[0]], OPERATIONS: [endpoints[0]], PARTNER: [endpoints[1]], CUSTOMER: [], NAZHIR_VIEWER: [endpoints[2]] };
    for (const role of Object.keys(allowed)) {
      const loggedIn = await login(matrixApp, `${role.toLowerCase()}@test.local`);
      const cookie = cookieOf(loggedIn);
      for (const endpoint of endpoints) {
        const response = await request(matrixApp).get(endpoint).set('Cookie', cookie ?? '');
        expect(response.status, `${role} ${endpoint}`).toBe(allowed[role].includes(endpoint) ? 200 : 403);
      }
    }
  });
  it('rejects malformed and expired JWT cookies', async () => {
    const expired = jwt.sign({ sub: 'partner' }, config.JWT_SECRET, { expiresIn: '-1s' });
    expect((await request(app).get('/auth/me').set('Cookie', 'dm_auth=malformed')).status).toBe(401);
    expect((await request(app).get('/auth/me').set('Cookie', `dm_auth=${expired}`)).status).toBe(401);
  });
  it('returns safe parser and not-found errors', async () => {
    const oversized = await request(app).post('/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@test.local', password: 'x'.repeat(33 * 1024) }));
    const malformed = await request(app).post('/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json').send('{"email":');
    const missing = await request(app).get('/does-not-exist');
    expect(oversized.status).toBe(413); expect(oversized.body.error).toBe('Request body too large');
    expect(malformed.status).toBe(400); expect(malformed.body.error).toBe('Invalid request');
    expect(missing.status).toBe(404); expect(missing.body.error).toBe('Not found');
  });
  it('limits login only, without blocking me requests', async () => {
    const limitedApp = makeApp();
    for (let attempt = 0; attempt < 10; attempt += 1) await login(limitedApp, 'unknown@test.local');
    expect((await login(limitedApp, 'unknown@test.local')).status).toBe(429);
    expect((await request(limitedApp).get('/auth/me')).status).toBe(401);
  });
  it('hides unexpected repository errors', async () => {
    const failingUsers: UserRepository = { findByEmail: async () => { throw new Error('database details'); }, findById: async () => null };
    const response = await request(createApp(new AuthService(failingUsers))).post('/auth/login').set('Origin', ORIGIN).send({ email: 'partner@test.local', password: 'Demo123!' });
    expect(response.status).toBe(500); expect(response.body.error).toBe('Internal server error'); expect(response.text).not.toContain('database details');
  });
});
