import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();
const origin = 'http://localhost:5173';
const login = async (email: string) => {
  const response = await request(app).post('/auth/login').set('Origin', origin).send({ email, password: 'Demo123!' });
  expect(response.status).toBe(200);
  return response.headers['set-cookie'][0];
};
const json = (cookie: string, method: 'post' | 'put' | 'patch', path: string, body: Record<string, unknown>) => request(app)[method](path).set('Cookie', cookie).set('Origin', origin).send(body);

let partnerOne = '';
let partnerTwo = '';
let categorySlug = 'pangan';

beforeAll(async () => {
  partnerOne = await login('partner@dapuremakita.local');
  partnerTwo = await login('partner.two@dapuremakita.local');
});

describe('partner portal authentication and tenant isolation', () => {
  it('rejects anonymous and non-partner requests', async () => {
    expect((await request(app).get('/api/partner/overview')).status).toBe(401);
    const customer = await login('customer@dapuremakita.local');
    expect((await request(app).get('/api/partner/overview').set('Cookie', customer)).status).toBe(403);
  });

  it('scopes profiles and rejects mass assignment', async () => {
    const profile = await json(partnerOne, 'put', '/api/partner/profile', { contactName: 'Mitra Satu', phone: '081234567890', address: 'Jalan Satu 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' });
    expect(profile.status).toBe(200);
    expect(await json(partnerOne, 'put', '/api/partner/profile', { contactName: 'Mitra Satu', phone: '081234567890', address: 'Jalan Satu 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111', partnerId: 'other' })).toBeTruthy();
    expect((await json(partnerOne, 'put', '/api/partner/profile', { contactName: 'Mitra Satu', phone: '081234567890', address: 'Jalan Satu 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111', partnerId: 'other' })).status).toBe(400);
    const other = await request(app).get('/api/partner/profile').set('Cookie', partnerTwo);
    expect(other.status).toBe(200);
    expect(other.body.profile.contactName).not.toBe('Mitra Satu');
  });

  it('keeps submissions isolated and rejects invalid or privileged fields', async () => {
    const invalid = await json(partnerOne, 'post', '/api/partner/submissions', { name: 'x', description: 'short', categoryId: categorySlug, hppRupiah: 0, capacityAmount: -1 });
    expect(invalid.status).toBe(400);
    const mass = await json(partnerOne, 'post', '/api/partner/submissions', { name: 'Mass Assignment', description: 'Deskripsi produk yang cukup panjang.', categoryId: categorySlug, status: 'APPROVED', partnerId: 'other' });
    expect(mass.status).toBe(400);
    const created = await json(partnerOne, 'post', '/api/partner/submissions', { name: 'Tenant Satu', description: 'Produk tenant satu untuk uji isolasi.', categoryId: categorySlug, hppRupiah: 12500, capacityAmount: 50, capacityUnit: 'pcs', capacityPeriod: 'per bulan' });
    expect(created.status).toBe(201);
    const id = created.body.submission.id as string;
    expect((await request(app).get(`/api/partner/submissions/${id}`).set('Cookie', partnerOne)).status).toBe(200);
    expect((await request(app).get(`/api/partner/submissions/${id}`).set('Cookie', partnerTwo)).status).toBe(404);
    expect((await json(partnerTwo, 'patch', `/api/partner/submissions/${id}`, { name: 'Bajak', description: 'Tidak boleh mengubah tenant lain.', categoryId: categorySlug })).status).toBe(404);
  });

  it('enforces completeness, safe upload allowlist, and immutable submitted state', async () => {
    const created = await json(partnerOne, 'post', '/api/partner/submissions', { name: 'State Smoke', description: 'Produk untuk menguji kelengkapan submit.', categoryId: categorySlug, hppRupiah: 15000, capacityAmount: 12, capacityUnit: 'botol', capacityPeriod: 'per minggu' });
    const id = created.body.submission.id as string;
    expect((await request(app).post(`/api/partner/submissions/${id}/submit`).set('Cookie', partnerOne).set('Origin', origin)).status).toBe(400);
    const invalidUpload = await request(app).post(`/api/partner/submissions/${id}/photos`).set('Cookie', partnerOne).set('Origin', origin).attach('file', Buffer.from('not an image'), { filename: '../../payload.exe', contentType: 'application/octet-stream' });
    expect(invalidUpload.status).toBe(400);
    const photo = await request(app).post(`/api/partner/submissions/${id}/photos`).set('Cookie', partnerOne).set('Origin', origin).attach('file', Buffer.from('%PDF-1.4 safe fixture'), { filename: '../../initial.pdf', contentType: 'application/pdf' });
    expect(photo.status).toBe(201);
    expect(photo.body.photo.originalName).toBe('initial.pdf');
    const submitted = await request(app).post(`/api/partner/submissions/${id}/submit`).set('Cookie', partnerOne).set('Origin', origin);
    expect(submitted.status).toBe(200);
    expect(submitted.body.submission.status).toBe('SUBMITTED');
    const immutable = await json(partnerOne, 'patch', `/api/partner/submissions/${id}`, { name: 'Tidak boleh', description: 'Perubahan setelah submit harus ditolak.', categoryId: categorySlug, status: 'APPROVED' });
    expect(immutable.status).toBe(400);
    const secondSubmit = await request(app).post(`/api/partner/submissions/${id}/submit`).set('Cookie', partnerOne).set('Origin', origin);
    expect(secondSubmit.status).toBe(409);
  });

  it('rejects malformed ids without leaking internals', async () => {
    const response = await request(app).get('/api/partner/submissions/not-valid').set('Cookie', partnerOne);
    expect(response.status).toBe(400);
    expect(response.text).not.toContain('Prisma');
    expect(response.text).not.toContain('stack');
  });
});
