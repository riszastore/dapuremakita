import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();
const origin = 'http://localhost:5173';
const login = async (email: string) => { const response = await request(app).post('/auth/login').set('Origin', origin).send({ email, password: 'Demo123!' }); expect(response.status).toBe(200); return response.headers['set-cookie'][0]; };
const checkout = (items: Array<{ productId: string; quantity: number }>, key: string) => request(app).post('/checkout').set('Origin', origin).send({ idempotencyKey: key, customer: { name: 'Pembeli Batch Lima', email: `${key}@example.com`, phone: '081234567890' }, shipping: { address: 'Jalan Uji Nomor 5', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' }, items });
let activeProductId = '';
let secondProductId = '';
let partnerOne = '';
let partnerTwo = '';
let admin = '';

beforeAll(async () => {
  const catalog = await request(app).get('/public/products?limit=10');
  activeProductId = catalog.body.items.find((item: { slug: string }) => item.slug === 'sambal-kecombrang').id;
  secondProductId = catalog.body.items.find((item: { slug: string }) => item.slug === 'granola-kelapa-jawa').id;
  partnerOne = await login('partner@dapuremakita.local');
  partnerTwo = await login('partner.two@dapuremakita.local');
  admin = await login('operations@dapuremakita.local');
});

describe('Batch 5 order checkout', () => {
  it('recalculates server prices and ignores client totals', async () => {
    const response = await request(app).post('/checkout').set('Origin', origin).send({ idempotencyKey: `price-${Date.now()}-tamper`, customer: { name: 'Pembeli', email: 'price@example.com', phone: '081234567890' }, shipping: { address: 'Jalan Uji 5', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' }, items: [{ productId: activeProductId, quantity: 2, price: 1, total: 1 }], subtotal: 1, total: 1 });
    expect(response.status).toBe(201); expect(response.body.order.totalRupiah).toBe(76000);
  });
  it('rejects inactive products and returns the same order for repeated checkout keys', async () => {
    const inactive = await request(app).get('/public/products/teh-rempah-draft');
    expect(inactive.status).toBe(404);
    const key = `idem-${Date.now()}-checkout`;
    const first = await checkout([{ productId: activeProductId, quantity: 1 }], key);
    const second = await checkout([{ productId: secondProductId, quantity: 9 }], key);
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(second.body.order.id).toBe(first.body.order.id);
  });
  it('makes mock payment idempotent and enforces fulfillment transitions', async () => {
    const created = await checkout([{ productId: activeProductId, quantity: 1 }], `flow-${Date.now()}-checkout`);
    const paymentKey = `payment-${Date.now()}-mock`;
    const paid = await request(app).post(`/orders/${created.body.order.id}/payment`).set('Origin', origin).send({ idempotencyKey: paymentKey, outcome: 'success' });
    const repeated = await request(app).post(`/orders/${created.body.order.id}/payment`).set('Origin', origin).send({ idempotencyKey: paymentKey, outcome: 'failure' });
    expect(paid.body.order.paymentStatus).toBe('SUCCEEDED'); expect(repeated.body.order.paymentStatus).toBe('SUCCEEDED');
    const invalid = await request(app).patch(`/api/admin/orders/${created.body.order.id}/status`).set('Cookie', admin).send({ status: 'DELIVERED' });
    expect(invalid.status).toBe(409);
    const processing = await request(app).patch(`/api/admin/orders/${created.body.order.id}/status`).set('Cookie', admin).send({ status: 'PROCESSING' });
    expect(processing.status).toBe(200);
  });
  it('protects admin management and isolates partner assigned items', async () => {
    const created = await checkout([{ productId: activeProductId, quantity: 1 }], `tenant-${Date.now()}-checkout`);
    const anonymous = await request(app).get('/api/admin/orders'); expect(anonymous.status).toBe(401);
    const customer = await login('customer@dapuremakita.local'); expect((await request(app).get('/api/admin/orders').set('Cookie', customer)).status).toBe(403);
    const detail = await request(app).get(`/api/admin/orders/${created.body.order.id}`).set('Cookie', admin);
    const itemId = detail.body.order.items[0].id as string;
    const assigned = await request(app).patch(`/api/admin/order-items/${itemId}/assignment`).set('Cookie', admin).send({ partnerId: 'invalid-partner-id' });
    expect(assigned.status).toBe(404);
    const forbiddenStatus = await request(app).patch(`/api/partner/order-items/${itemId}/status`).set('Cookie', partnerTwo).send({ status: 'IN_PRODUCTION' });
    expect(forbiddenStatus.status).toBe(404);
    const ordersOne = await request(app).get('/api/partner/orders').set('Cookie', partnerOne);
    const ordersTwo = await request(app).get('/api/partner/orders').set('Cookie', partnerTwo);
    expect(ordersOne.status).toBe(200); expect(ordersTwo.status).toBe(200);
    const foreign = ordersTwo.body.items.find((item: { orderId: string }) => item.orderId === created.body.order.id);
    expect(foreign).toBeUndefined();
  });
});
