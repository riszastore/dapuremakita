import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

/**
 * Regresi runtime untuk laporan Batch 6: login nyata per peran, session cookie, akses
 * finance, proteksi write Nazhir, pemisahan tenant mitra, dan matriks origin yang dulu
 * membuat login membalas 403 "Forbidden".
 */
const app = createApp();
/** Instance terpisah untuk matriks origin karena pembatasi login berjalan per instance. */
const originApp = createApp();
const origin = 'http://localhost:5173';
const PASSWORD = 'Demo123!';
const NAZHIR_EMAIL = 'nazhir@dapuremakita.local';

type App = ReturnType<typeof createApp>;

const signIn = (target: App, headers: Record<string, string>, email: string) =>
  request(target).post('/auth/login').set(headers).send({ email, password: PASSWORD });

const cookieOf = (response: { headers: { 'set-cookie'?: string[] } }): string => {
  const value = response.headers['set-cookie']?.[0];
  if (!value) throw new Error('session cookie tidak terbentuk');
  expect(value).toMatch(/dm_auth=/);
  expect(value).toMatch(/httponly/i);
  return value;
};

let nazhir = '';
let superadmin = '';
let operations = '';
let partnerOne = '';
let partnerTwo = '';
let partnerOneId = '';
let partnerTwoId = '';
let setupOrderId = '';
let setupProductId = '';

beforeAll(async () => {
  // 1-5: login tiap peran (pembatasi login mengizinkan 10 per menit per instance).
  const nazhirLogin = await signIn(app, { Origin: origin }, NAZHIR_EMAIL);
  expect(nazhirLogin.status).toBe(200);
  expect(nazhirLogin.body.user.role).toBe('NAZHIR_VIEWER');
  nazhir = cookieOf(nazhirLogin);

  const adminLogin = await signIn(app, { Origin: origin }, 'superadmin@dapuremakita.local');
  expect(adminLogin.status).toBe(200);
  superadmin = cookieOf(adminLogin);

  const operationsLogin = await signIn(app, { Origin: origin }, 'operations@dapuremakita.local');
  expect(operationsLogin.status).toBe(200);
  operations = cookieOf(operationsLogin);

  const partnerOneLogin = await signIn(app, { Origin: origin }, 'partner@dapuremakita.local');
  expect(partnerOneLogin.status).toBe(200);
  partnerOne = cookieOf(partnerOneLogin);

  const partnerTwoLogin = await signIn(app, { Origin: origin }, 'partner.two@dapuremakita.local');
  expect(partnerTwoLogin.status).toBe(200);
  partnerTwo = cookieOf(partnerTwoLogin);

  // ID partner (bukan ID user) diambil dari laporan mitra milik SUPER_ADMIN.
  const partnerReport = await request(app).get('/api/admin/finance/reports/partners?limit=100').set('Cookie', superadmin);
  expect(partnerReport.status).toBe(200);
  const rows = partnerReport.body.items as Array<{ partner: { id: string; email: string | null } }>;
  partnerOneId = rows.find((row) => row.partner.email === 'partner@dapuremakita.local')?.partner.id ?? '';
  partnerTwoId = rows.find((row) => row.partner.email === 'partner.two@dapuremakita.local')?.partner.id ?? '';
  expect(partnerOneId).toBeTruthy();
  expect(partnerTwoId).toBeTruthy();

  // Data uji milik sendiri: checkout -> penugasan mitra satu -> pembayaran sukses,
  // sehingga isolasi tenant dapat dibuktikan dengan angka nyata tanpa mengubah
  // data uji milik finance.test.ts (mitra dua selalu nol).
  const products = await request(app).get('/public/products?limit=1');
  expect(products.status).toBe(200);
  setupProductId = products.body.items[0].id as string;

  const checkout = await request(app).post('/checkout').set('Origin', origin).send({
    idempotencyKey: `login-flow-${Date.now()}-checkout`,
    customer: { name: 'Uji Login', email: 'uji.login@dapuremakita.local', phone: '081234567890' },
    shipping: { address: 'Jalan Uji Login 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' },
    items: [{ productId: setupProductId, quantity: 1 }],
  });
  expect(checkout.status).toBe(201);
  const setupOrder = checkout.body.order as { id: string; orderNumber: string };
  setupOrderId = setupOrder.id;

  const detail = await request(app).get(`/api/orders/${setupOrder.orderNumber}`);
  expect(detail.status).toBe(200);
  const itemId = (detail.body.order as { items: Array<{ id: string }> }).items[0].id;

  const assigned = await request(app)
    .patch(`/api/admin/order-items/${itemId}/assignment`)
    .set('Cookie', superadmin)
    .set('Origin', origin)
    .send({ partnerId: partnerOneId });
  expect(assigned.status).toBe(200);

  const paid = await request(app)
    .post(`/orders/${setupOrderId}/payment`)
    .set('Origin', origin)
    .send({ idempotencyKey: `login-flow-${Date.now()}-payment` });
  expect(paid.status).toBe(200);
  expect(paid.body.order.paymentStatus).toBe('SUCCEEDED');
});

describe('real runtime login per peran', () => {
  it('NAZHIR_VIEWER: login membentuk session cookie lalu seluruh panel GET tersedia', async () => {
    const panels = [
      '/auth/me',
      '/api/nazhir/overview',
      '/api/nazhir/finance/summary',
      '/api/nazhir/finance/transactions',
      '/api/nazhir/finance/accruals',
      '/api/nazhir/finance/payouts',
      '/api/nazhir/finance/reports/products',
      '/api/nazhir/finance/reports/partners',
      '/api/nazhir/finance/reports/impact',
    ];
    for (const path of panels) {
      const response = await request(app).get(path).set('Cookie', nazhir);
      expect(response.status, `GET ${path}`).toBe(200);
    }
    const summary = await request(app).get('/api/nazhir/finance/summary').set('Cookie', nazhir);
    expect(summary.body.summary.checks).toEqual({ identityHold: true, marginNonNegative: true, payoutWithinHak: true });
  });

  it('NAZHIR_VIEWER: setiap request tulis diblokir 403 Read-only account', async () => {
    const checkoutBody = {
      idempotencyKey: `nazhir-write-attempt-${Date.now()}`,
      customer: { name: 'Nazhir', email: 'nazhir@dapuremakita.local', phone: '081234567890' },
      shipping: { address: 'Jalan Nazhir 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' },
      items: [{ productId: setupProductId, quantity: 1 }],
    };
    const writes: Array<[string, string, Record<string, unknown>]> = [
      ['post', '/api/admin/finance/payouts', { idempotencyKey: `nazhir-payout-attempt-${Date.now()}`, partnerId: partnerOneId }],
      ['post', '/api/checkout', checkoutBody],
      ['post', `/api/orders/${setupOrderId}/payment`, { idempotencyKey: `nazhir-payment-attempt-${Date.now()}` }],
      ['patch', `/api/admin/orders/${setupOrderId}/status`, { status: 'PROCESSING' }],
      ['put', '/api/partner/profile', { contactName: 'Nazhir', phone: '081234567890', address: 'Jalan Nazhir 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' }],
    ];
    for (const [method, path, body] of writes) {
      const response = await (request(app) as unknown as Record<string, (value: string) => request.Test>)[method](path)
        .set('Cookie', nazhir)
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send(body);
      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(response.body.error, `${method.toUpperCase()} ${path}`).toBe('Read-only account');
    }

    const adminRead = await request(app).get('/api/admin/finance/summary').set('Cookie', nazhir);
    const partnerRead = await request(app).get('/api/partner/finance').set('Cookie', nazhir);
    expect(adminRead.status).toBe(403);
    expect(adminRead.body.error).toBe('Forbidden');
    expect(partnerRead.status).toBe(403);
    expect(partnerRead.body.error).toBe('Forbidden');
  });

  it('NAZHIR_VIEWER: logout lalu login ulang tetap berhasil (guard tidak menghalangi auth)', async () => {
    const logout = await request(app).post('/auth/logout').set('Cookie', nazhir).set('Origin', origin);
    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/dm_auth=;/);
    expect((await request(app).get('/auth/me')).status).toBe(401);

    const again = await signIn(app, { Origin: origin }, NAZHIR_EMAIL);
    expect(again.status).toBe(200);
    nazhir = cookieOf(again);
    expect((await request(app).get('/api/nazhir/finance/summary').set('Cookie', nazhir)).status).toBe(200);
  });

  it('SUPER_ADMIN: login, membaca finance, membuat payout lalu membatalkannya kembali', async () => {
    const summary = await request(app).get('/api/admin/finance/summary').set('Cookie', superadmin);
    expect(summary.status).toBe(200);
    expect(summary.body.summary.checks).toEqual({ identityHold: true, marginNonNegative: true, payoutWithinHak: true });

    const partners = await request(app).get('/api/admin/finance/reports/partners?limit=100').set('Cookie', superadmin);
    expect(partners.status).toBe(200);
    const funded = (partners.body.items as Array<{ partner: { id: string }; hakAvailableRupiah: number }>)
      .find((row) => row.hakAvailableRupiah > 0);
    const target = funded?.partner.id ?? (partners.body.items as Array<{ partner: { id: string } }>)[0]?.partner.id;
    expect(target).toBeTruthy();

    const body = { idempotencyKey: `login-payout-${Date.now()}-key`, partnerId: target as string };
    const created = await request(app).post('/api/admin/finance/payouts').set('Cookie', superadmin).set('Origin', origin).send(body);
    if (funded) {
      expect(created.status).toBe(201);
      expect(created.body.payout.amountRupiah).toBeGreaterThan(0);
      expect(created.body.payout.amountRupiah).toBeLessThanOrEqual(funded.hakAvailableRupiah);

      const replay = await request(app).post('/api/admin/finance/payouts').set('Cookie', superadmin).set('Origin', origin).send(body);
      expect(replay.status).toBe(200);
      expect(replay.body.idempotent).toBe(true);
      expect(replay.body.payout.id).toBe(created.body.payout.id);

      const cancelled = await request(app)
        .post(`/api/admin/finance/payouts/${created.body.payout.id}/cancel`)
        .set('Cookie', superadmin)
        .set('Origin', origin)
        .send({});
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.payout.status).toBe('CANCELLED');
    } else {
      expect(created.status).toBe(409);
    }
  });

  it('OPERATIONS: login dan membaca finance tanpa hak payout write', async () => {
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', operations)).status).toBe(200);
    expect((await request(app).get('/api/admin/finance/transactions').set('Cookie', operations)).status).toBe(200);
    const write = await request(app)
      .post('/api/admin/finance/payouts')
      .set('Cookie', operations)
      .set('Origin', origin)
      .send({ idempotencyKey: `ops-payout-attempt-${Date.now()}`, partnerId: partnerOneId });
    expect(write.status).toBe(403);
    expect(write.body.error).toBe('Forbidden');
    expect((await request(app).get('/api/nazhir/finance/summary').set('Cookie', operations)).status).toBe(403);
  });

  it('PARTNER: hanya finance miliknya sendiri yang terlihat dan area lain ditolak', async () => {
    const own = await request(app).get('/api/partner/finance').set('Cookie', partnerOne);
    const other = await request(app).get('/api/partner/finance').set('Cookie', partnerTwo);
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);
    expect(own.body.finance.hakProdusen.accruedRupiah).toBeGreaterThan(0);
    expect(own.body.finance.omzetKontribusiRupiah).toBeGreaterThan(0);
    expect(other.body.finance.hakProdusen.accruedRupiah).toBe(0);
    expect(other.body.finance.omzetKontribusiRupiah).toBe(0);
    expect(other.body.finance.payout.items).toHaveLength(0);

    const report = await request(app).get('/api/admin/finance/reports/partners?limit=100').set('Cookie', superadmin);
    const rows = report.body.items as Array<{ partner: { id: string }; hakProdusenRupiah: number; omzetRupiah: number }>;
    expect(own.body.finance.hakProdusen.accruedRupiah).toBe(rows.find((row) => row.partner.id === partnerOneId)?.hakProdusenRupiah);
    expect(other.body.finance.hakProdusen.accruedRupiah).toBe(rows.find((row) => row.partner.id === partnerTwoId)?.hakProdusenRupiah);

    for (const path of ['/api/admin/finance/summary', '/api/admin/finance/accruals', '/api/nazhir/finance/summary', `/api/nazhir/finance/accruals?partnerId=${partnerTwoId}`]) {
      const blocked = await request(app).get(path).set('Cookie', partnerOne);
      expect(blocked.status, `GET ${path}`).toBe(403);
      expect(blocked.body.error, `GET ${path}`).toBe('Forbidden');
    }
  });
});

describe('origin matrix login (regresi 403 Forbidden)', () => {
  it('menerima origin loopback setara (127.0.0.1) beserta header CORS dan session yang valid', async () => {
    const login = await signIn(originApp, { Origin: 'http://127.0.0.1:5173' }, NAZHIR_EMAIL);
    expect(login.status).toBe(200);
    expect(login.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    expect(login.body.user.role).toBe('NAZHIR_VIEWER');
    const cookie = cookieOf(login);
    expect((await request(originApp).get('/api/nazhir/finance/summary').set('Cookie', cookie)).status).toBe(200);
  });

  it('menerima Referer halaman login tanpa header Origin', async () => {
    const login = await signIn(originApp, { Referer: 'http://127.0.0.1:5173/login' }, NAZHIR_EMAIL);
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('NAZHIR_VIEWER');
  });

  it('menerima browser modern yang hanya mengirim Sec-Fetch-Site', async () => {
    const login = await signIn(originApp, { 'Sec-Fetch-Site': 'same-origin' }, NAZHIR_EMAIL);
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('NAZHIR_VIEWER');
  });

  it('menolak origin lintas situs dengan 403 Forbidden tanpa header CORS', async () => {
    const login = await signIn(originApp, { Origin: 'https://evil.example' }, NAZHIR_EMAIL);
    expect(login.status).toBe(403);
    expect(login.body.error).toBe('Forbidden');
    expect(login.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('menolak klien tanpa asal sama sekali (paritas proteksi CSRF Batch 1)', async () => {
    const login = await signIn(originApp, {}, NAZHIR_EMAIL);
    expect(login.status).toBe(403);
    expect(login.body.error).toBe('Forbidden');
  });
});
