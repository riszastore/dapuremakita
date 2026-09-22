import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();
const origin = 'http://localhost:5173';
const PRICE = 38000;
const QUANTITY = 2;
const LINE_TOTAL = PRICE * QUANTITY;
const SHARE_BPS = 8000;
const EXPECTED_HAK = Math.floor((LINE_TOTAL * SHARE_BPS + 5000) / 10000);
const EXPECTED_MARGIN = LINE_TOTAL - EXPECTED_HAK;

const login = async (email: string) => {
  const response = await request(app).post('/auth/login').set('Origin', origin).send({ email, password: 'Demo123!' });
  expect(response.status).toBe(200);
  return response.headers['set-cookie'][0];
};

let superadmin = '';
let operations = '';
let curator = '';
let customer = '';
let partnerOne = '';
let partnerTwo = '';
let nazhir = '';
let productId = '';
let secondProductId = '';
let partnerOneId = '';
let partnerTwoId = '';

const summary = async (cookie = superadmin, query = '') => {
  const response = await request(app).get(`/api/admin/finance/summary${query}`).set('Cookie', cookie);
  expect(response.status).toBe(200);
  return response.body.summary as {
    producerShareBps: number;
    omzet: { totalRupiah: number; productRupiah: number; orderCount: number };
    hakProdusen: { accruedRupiah: number; availableRupiah: number; reservedRupiah: number; paidRupiah: number };
    margin: { totalRupiah: number };
    payout: { completedAmountRupiah: number; completedCount: number };
    checks: { identityHold: boolean; marginNonNegative: boolean; payoutWithinHak: boolean };
  };
};

const nazhirGet = async (path: string) => request(app).get(path).set('Cookie', nazhir);

const checkout = async (quantity: number, key: string) => {
  const response = await request(app).post('/checkout').set('Origin', origin).send({
    idempotencyKey: key,
    customer: { name: 'Pembeli Finance', email: `${key}@example.com`, phone: '081234567890' },
    shipping: { address: 'Jalan Finance 6', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' },
    items: [{ productId, quantity }],
  });
  expect(response.status).toBe(201);
  return response.body.order as { id: string; orderNumber: string; totalRupiah: number };
};

const pay = async (orderId: string, key: string, outcome: 'success' | 'failure' = 'success') => {
  const response = await request(app).post(`/orders/${orderId}/payment`).set('Origin', origin).send({ idempotencyKey: key, outcome });
  expect(response.status).toBe(200);
  return response.body.order as { paymentStatus: string };
};

const createPayout = (cookie: string, body: Record<string, unknown>) =>
  request(app).post('/api/admin/finance/payouts').set('Cookie', cookie).set('Origin', origin).send(body);

let firstPaidOrder = '';

beforeAll(async () => {
  [superadmin, operations, curator, customer, partnerOne, partnerTwo, nazhir] = await Promise.all([
    login('superadmin@dapuremakita.local'),
    login('operations@dapuremakita.local'),
    login('curator@dapuremakita.local'),
    login('customer@dapuremakita.local'),
    login('partner@dapuremakita.local'),
    login('partner.two@dapuremakita.local'),
    login('nazhir@dapuremakita.local'),
  ]);
  const catalog = await request(app).get('/public/products?limit=10');
  productId = catalog.body.items.find((item: { slug: string }) => item.slug === 'sambal-kecombrang').id;
  secondProductId = catalog.body.items.find((item: { slug: string }) => item.slug === 'granola-kelapa-jawa').id;
  expect(productId).toBeTruthy();
  expect(secondProductId).toBeTruthy();
  const partners = await request(app).get('/api/admin/partners?page=1&limit=50').set('Cookie', superadmin);
  expect(partners.status).toBe(200);
  partnerOneId = partners.body.items.find((item: { slug: string }) => item.slug === 'dapur-ibu-nusantara').id;
  partnerTwoId = partners.body.items.find((item: { slug: string }) => item.slug === 'kelompok-pagi-sejahtera').id;
  expect(partnerOneId).toBeTruthy();
  expect(partnerTwoId).toBeTruthy();
});

describe('batch 6 finance calculations', () => {
  it('counts only financially valid orders into omzet, hak produsen, and margin', async () => {
    const before = await summary();
    expect(before.producerShareBps).toBe(SHARE_BPS);
    const order = await checkout(QUANTITY, `finance-omzet-${Date.now()}`);
    expect(order.totalRupiah).toBe(LINE_TOTAL);

    const unpaid = await summary();
    expect(unpaid.omzet.totalRupiah).toBe(before.omzet.totalRupiah);
    expect(unpaid.hakProdusen.accruedRupiah).toBe(before.hakProdusen.accruedRupiah);

    const paid = await pay(order.id, `finance-pay-${Date.now()}`);
    expect(paid.paymentStatus).toBe('SUCCEEDED');

    const after = await summary();
    expect(after.omzet.totalRupiah - before.omzet.totalRupiah).toBe(LINE_TOTAL);
    expect(after.omzet.productRupiah - before.omzet.productRupiah).toBe(LINE_TOTAL);
    expect(after.hakProdusen.accruedRupiah - before.hakProdusen.accruedRupiah).toBe(EXPECTED_HAK);
    expect(after.margin.totalRupiah - before.margin.totalRupiah).toBe(EXPECTED_MARGIN);
    expect(after.omzet.totalRupiah).toBe(after.hakProdusen.accruedRupiah + after.margin.totalRupiah);
    expect(after.checks).toEqual({ identityHold: true, marginNonNegative: true, payoutWithinHak: true });
    firstPaidOrder = order.orderNumber;
  });

  it('keeps unpaid and failed orders out of omzet and transaction history', async () => {
    const before = await summary();
    const unpaid = await checkout(1, `finance-unpaid-${Date.now()}`);
    const failed = await checkout(1, `finance-failed-${Date.now()}`);
    expect((await pay(failed.id, `finance-fail-${Date.now()}`, 'failure')).paymentStatus).toBe('FAILED');

    const after = await summary();
    expect(after.omzet.totalRupiah).toBe(before.omzet.totalRupiah);
    expect(after.hakProdusen.accruedRupiah).toBe(before.hakProdusen.accruedRupiah);
    expect(after.margin.totalRupiah).toBe(before.margin.totalRupiah);

    const transactions = await request(app).get('/api/admin/finance/transactions?type=ORDER&limit=100').set('Cookie', superadmin);
    expect(transactions.status).toBe(200);
    const references = transactions.body.items.map((row: { reference: string }) => row.reference);
    expect(references).not.toContain(unpaid.orderNumber);
    expect(references).not.toContain(failed.orderNumber);
    expect(references).toContain(firstPaidOrder);
  });

  it('materializes one accurate producer share accrual per paid item and links HPP', async () => {
    const accruals = await request(app).get('/api/admin/finance/accruals?limit=100').set('Cookie', superadmin);
    expect(accruals.status).toBe(200);
    const row = accruals.body.items.find((item: { order: { orderNumber: string } }) => item.order.orderNumber === firstPaidOrder);
    expect(row).toBeTruthy();
    expect(row.orderItem.lineTotalRupiah).toBe(LINE_TOTAL);
    expect(row.amountRupiah).toBe(EXPECTED_HAK);
    expect(row.partner.id).toBe(partnerOneId);
    expect(['AVAILABLE', 'RESERVED', 'PAID']).toContain(row.status);

    const duplicates = accruals.body.items.filter((item: { order: { orderNumber: string } }) => item.order.orderNumber === firstPaidOrder);
    expect(duplicates).toHaveLength(1);
  });

  it('produces consistent product, partner, and impact reports', async () => {
    const current = await summary();
    const products = await request(app).get('/api/admin/finance/reports/products?limit=100').set('Cookie', superadmin);
    const partners = await request(app).get('/api/admin/finance/reports/partners?limit=100').set('Cookie', superadmin);
    const impact = await request(app).get('/api/admin/finance/reports/impact').set('Cookie', superadmin);
    expect(products.status).toBe(200);
    expect(partners.status).toBe(200);
    expect(impact.status).toBe(200);

    const productOmzet = products.body.items.reduce((sum: number, row: { omzetRupiah: number }) => sum + row.omzetRupiah, 0);
    const partnerHak = partners.body.items.reduce((sum: number, row: { hakProdusenRupiah: number }) => sum + row.hakProdusenRupiah, 0);
    expect(productOmzet).toBe(current.omzet.productRupiah);
    expect(partnerHak).toBe(current.hakProdusen.accruedRupiah);
    expect(impact.body.totals.omzetRupiah).toBe(current.omzet.totalRupiah);
    expect(impact.body.totals.hakProdusenRupiah).toBe(current.hakProdusen.accruedRupiah);
    expect(impact.body.totals.marginRupiah).toBe(current.margin.totalRupiah);
    expect(impact.body.checks.identityHold).toBe(true);

    const sambal = products.body.items.find((row: { slug: string }) => row.slug === 'sambal-kecombrang');
    expect(sambal).toBeTruthy();
    expect(sambal.hppKnown).toBe(true);
    expect(sambal.hppTotalRupiah).toBe(24000 * sambal.quantity);
    expect(sambal.marginRupiah).toBe(sambal.omzetRupiah - sambal.hakProdusenRupiah);

    const own = partners.body.items.find((row: { partner: { id: string } }) => row.partner.id === partnerOneId);
    expect(own.itemCount).toBeGreaterThan(0);
    expect(own.marginRupiah).toBe(own.omzetRupiah - own.hakProdusenRupiah);
    expect(own.hakAvailableRupiah + own.hakReservedRupiah + own.hakPaidRupiah).toBe(own.hakProdusenRupiah);
  });

  it('applies and validates reporting date ranges', async () => {
    const future = await summary(superadmin, '?from=2099-01-01&to=2099-01-31');
    expect(future.omzet.totalRupiah).toBe(0);
    expect(future.omzet.orderCount).toBe(0);
    expect(future.hakProdusen.accruedRupiah).toBe(0);
    const invalid = await request(app).get('/api/admin/finance/summary?from=2026-12-31&to=2026-01-01').set('Cookie', superadmin);
    expect(invalid.status).toBe(400);
    const malformed = await request(app).get('/api/admin/finance/summary?from=31-12-2026').set('Cookie', superadmin);
    expect(malformed.status).toBe(400);
  });
});

describe('batch 6 finance authorization', () => {
  it('grants finance reads only to the roles that own them', async () => {
    expect((await request(app).get('/api/admin/finance/summary')).status).toBe(401);
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', customer)).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', curator)).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', partnerOne)).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', nazhir)).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', operations)).status).toBe(200);
    expect((await request(app).get('/api/admin/finance/summary').set('Cookie', superadmin)).status).toBe(200);
    expect((await request(app).get('/api/nazhir/finance/summary').set('Cookie', superadmin)).status).toBe(403);
    expect((await request(app).get('/api/partner/finance').set('Cookie', partnerTwo)).status).toBe(200);
  });

  it('limits payout writes to SUPER_ADMIN and blocks OPERATIONS', async () => {
    const body = { idempotencyKey: `finance-ops-${Date.now()}-key`, partnerId: partnerOneId };
    expect((await createPayout(operations, body)).status).toBe(403);
    expect((await createPayout(curator, body)).status).toBe(403);
    expect((await createPayout(partnerOne, body)).status).toBe(403);
    expect((await createPayout(nazhir, body)).status).toBe(403);
    expect((await createPayout(superadmin, { ...body, amountRupiah: 1 })).status).toBe(400);
    expect((await createPayout(superadmin, { partnerId: partnerOneId })).status).toBe(400);
    expect((await createPayout(superadmin, { idempotencyKey: `finance-empty-${Date.now()}-key`, partnerId: partnerOneId, accrualIds: [] })).status).toBe(400);
  });

  it('keeps the NAZHIR_VIEWER session strictly read-only on the backend', async () => {
    for (const path of ['/api/nazhir/finance/summary', '/api/nazhir/finance/transactions', '/api/nazhir/finance/accruals', '/api/nazhir/finance/payouts', '/api/nazhir/finance/reports/products', '/api/nazhir/finance/reports/partners', '/api/nazhir/finance/reports/impact', '/api/nazhir/overview']) {
      expect((await nazhirGet(path)).status, path).toBe(200);
    }
    expect((await nazhirGet('/api/admin/finance/summary')).status).toBe(403);
    expect((await nazhirGet('/api/admin/orders')).status).toBe(403);
    expect((await nazhirGet('/api/partner/finance')).status).toBe(403);

    const order = await checkout(1, `finance-nazhir-${Date.now()}`);
    const blocked: Array<[string, string, unknown]> = [
      ['post', '/api/admin/finance/payouts', { idempotencyKey: `nazhir-write-${Date.now()}-key`, partnerId: partnerOneId }],
      ['post', `/api/admin/finance/payouts/${order.id}/complete`, {}],
      ['patch', `/api/admin/orders/${order.id}/status`, { status: 'PROCESSING' }],
      ['patch', `/api/admin/order-items/${order.id}/assignment`, { partnerId: partnerOneId }],
      ['patch', `/api/partner/order-items/${order.id}/status`, { status: 'IN_PRODUCTION' }],
      ['put', '/api/partner/profile', { contactName: 'Nazhir', phone: '081234567890', address: 'Jalan Nazhir 1', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' }],
      ['post', '/checkout', { idempotencyKey: `nazhir-checkout-${Date.now()}` }],
      ['post', `/orders/${order.id}/payment`, { idempotencyKey: `nazhir-payment-${Date.now()}` }],
      ['delete', '/api/partner/legal-documents/anything-long-enough', undefined],
    ];
    for (const [method, path, body] of blocked) {
      const response = await (request(app) as unknown as Record<string, (value: string) => request.Test>)[method](path)
        .set('Cookie', nazhir)
        .set('Origin', origin)
        .send(body as object);
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(response.body.error).toBe('Read-only account');
    }
    const after = await summary();
    expect(after.omzet.orderCount).toBeGreaterThan(0);
  });

  it('isolates partner finance views per tenant', async () => {
    const own = await request(app).get('/api/partner/finance').set('Cookie', partnerOne);
    const other = await request(app).get('/api/partner/finance').set('Cookie', partnerTwo);
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);
    expect(own.body.finance.omzetKontribusiRupiah).toBeGreaterThan(0);
    expect(own.body.finance.hakProdusen.accruedRupiah).toBeGreaterThan(0);
    expect(other.body.finance.omzetKontribusiRupiah).toBe(0);
    expect(other.body.finance.hakProdusen.accruedRupiah).toBe(0);
    expect(other.body.finance.payout.items).toHaveLength(0);
    expect((await request(app).get('/api/admin/finance/payouts').set('Cookie', partnerOne)).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/accruals').set('Cookie', partnerTwo)).status).toBe(403);
  });

  it('blocks reassignment of paid items that already carry a producer share', async () => {
    const orders = await request(app).get('/api/admin/orders').set('Cookie', superadmin);
    expect(orders.status).toBe(200);
    const order = orders.body.orders.find((row: { orderNumber: string }) => row.orderNumber === firstPaidOrder);
    expect(order).toBeTruthy();
    const item = order.items[0];
    const reassigned = await request(app)
      .patch(`/api/admin/order-items/${item.id}/assignment`)
      .set('Cookie', superadmin)
      .set('Origin', origin)
      .send({ partnerId: partnerTwoId });
    expect(reassigned.status).toBe(409);
    const same = await request(app)
      .patch(`/api/admin/order-items/${item.id}/assignment`)
      .set('Cookie', superadmin)
      .set('Origin', origin)
      .send({ partnerId: partnerOneId });
    expect(same.status).toBe(200);
    expect(same.body.item.partnerId).toBe(partnerOneId);
  });
});

describe('batch 6 payout lifecycle', () => {
  let firstPayoutId = '';
  let firstPayoutAmount = 0;

  it('caps payouts at the available producer share and ignores client amounts', async () => {
    const before = await summary();
    const noneForPartnerTwo = await createPayout(superadmin, { idempotencyKey: `finance-partner-two-${Date.now()}-key`, partnerId: partnerTwoId });
    expect(noneForPartnerTwo.status).toBe(409);

    const accruals = await request(app).get('/api/admin/finance/accruals?limit=100').set('Cookie', superadmin);
    const ownAccrual = accruals.body.items.find((item: { order: { orderNumber: string } }) => item.order.orderNumber === firstPaidOrder);
    expect(ownAccrual.status).toBe('AVAILABLE');
    const foreign = await createPayout(superadmin, { idempotencyKey: `finance-foreign-${Date.now()}-key`, partnerId: partnerTwoId, accrualIds: [ownAccrual.id] });
    expect(foreign.status).toBe(404);

    const key = `finance-payout-${Date.now()}-key`;
    const created = await createPayout(superadmin, { idempotencyKey: key, partnerId: partnerOneId });
    expect(created.status).toBe(201);
    firstPayoutId = created.body.payout.id;
    firstPayoutAmount = created.body.payout.amountRupiah;
    expect(firstPayoutAmount).toBeGreaterThan(0);
    expect(firstPayoutAmount).toBeLessThanOrEqual(before.hakProdusen.availableRupiah);
    const accrualSum = created.body.payout.accruals.reduce((sum: number, row: { amountRupiah: number }) => sum + row.amountRupiah, 0);
    expect(accrualSum).toBe(firstPayoutAmount);

    const reserved = await summary();
    expect(reserved.hakProdusen.reservedRupiah).toBeGreaterThanOrEqual(firstPayoutAmount);
    expect(reserved.hakProdusen.availableRupiah).toBe(before.hakProdusen.availableRupiah - firstPayoutAmount);
    expect(reserved.checks.payoutWithinHak).toBe(true);

    const replay = await createPayout(superadmin, { idempotencyKey: key, partnerId: partnerOneId });
    expect(replay.status).toBe(200);
    expect(replay.body.payout.id).toBe(firstPayoutId);
    expect(replay.body.idempotent).toBe(true);

    const empty = await createPayout(superadmin, { idempotencyKey: `finance-second-${Date.now()}-key`, partnerId: partnerOneId });
    expect(empty.status).toBe(409);
    const explicit = await createPayout(superadmin, {
      idempotencyKey: `finance-explicit-${Date.now()}-key`,
      partnerId: partnerOneId,
      accrualIds: created.body.payout.accruals.map((row: { id: string }) => row.id),
    });
    expect(explicit.status).toBe(409);
  });

  it('never allows two concurrent payouts to claim the same producer share', async () => {
    const order = await checkout(QUANTITY, `finance-race-${Date.now()}`);
    await pay(order.id, `finance-race-pay-${Date.now()}`);
    const before = await summary();
    expect(before.hakProdusen.availableRupiah).toBeGreaterThan(0);

    const [first, second] = await Promise.all([
      createPayout(superadmin, { idempotencyKey: `finance-race-a-${Date.now()}-key`, partnerId: partnerOneId }),
      createPayout(superadmin, { idempotencyKey: `finance-race-b-${Date.now()}-key`, partnerId: partnerOneId }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = first.status === 201 ? first : second;
    expect(winner.body.payout.amountRupiah).toBe(before.hakProdusen.availableRupiah);

    const after = await summary();
    expect(after.hakProdusen.availableRupiah).toBe(0);
    expect(after.hakProdusen.reservedRupiah).toBeGreaterThanOrEqual(winner.body.payout.amountRupiah);
    const completedPayouts = winner.body.payout;
    expect(completedPayouts.status).toBe('PENDING');
  });

  it('completes payouts once, cancels pending payouts, and restores released share', async () => {
    const payouts = await request(app).get('/api/admin/finance/payouts?limit=50').set('Cookie', superadmin);
    expect(payouts.status).toBe(200);
    const pending = payouts.body.items.filter((row: { status: string }) => row.status === 'PENDING');
    expect(pending.length).toBeGreaterThanOrEqual(2);

    const releaseOrder = await checkout(1, `finance-release-${Date.now()}`);
    await pay(releaseOrder.id, `finance-release-pay-${Date.now()}`);
    const beforeCancel = await summary();
    const releasePayout = await createPayout(superadmin, { idempotencyKey: `finance-cancel-${Date.now()}-key`, partnerId: partnerOneId });
    expect(releasePayout.status).toBe(201);
    const held = await summary();
    expect(held.hakProdusen.availableRupiah).toBe(beforeCancel.hakProdusen.availableRupiah - releasePayout.body.payout.amountRupiah);

    const cancelled = await request(app).post(`/api/admin/finance/payouts/${releasePayout.body.payout.id}/cancel`).set('Cookie', superadmin).set('Origin', origin);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.payout.status).toBe('CANCELLED');
    const released = await summary();
    expect(released.hakProdusen.availableRupiah).toBe(beforeCancel.hakProdusen.availableRupiah);
    expect(released.hakProdusen.reservedRupiah).toBe(held.hakProdusen.reservedRupiah - releasePayout.body.payout.amountRupiah);

    for (const payout of pending) {
      const completed = await request(app).post(`/api/admin/finance/payouts/${payout.id}/complete`).set('Cookie', superadmin).set('Origin', origin);
      expect(completed.status).toBe(200);
      expect(completed.body.payout.status).toBe('COMPLETED');
      expect(completed.body.payout.completedAt).toBeTruthy();
      const again = await request(app).post(`/api/admin/finance/payouts/${payout.id}/complete`).set('Cookie', superadmin).set('Origin', origin);
      expect(again.status).toBe(409);
      const cancelAfter = await request(app).post(`/api/admin/finance/payouts/${payout.id}/cancel`).set('Cookie', superadmin).set('Origin', origin);
      expect(cancelAfter.status).toBe(409);
      const retry = await createPayout(superadmin, { idempotencyKey: `finance-retry-${payout.id}`, partnerId: partnerOneId });
      expect([201, 409]).toContain(retry.status);
      if (retry.status === 201) {
        const cleanup = await request(app).post(`/api/admin/finance/payouts/${retry.body.payout.id}/cancel`).set('Cookie', superadmin).set('Origin', origin);
        expect(cleanup.status).toBe(200);
      }
    }

    const finalState = await summary();
    expect(finalState.checks).toEqual({ identityHold: true, marginNonNegative: true, payoutWithinHak: true });
    expect(finalState.hakProdusen.paidRupiah).toBeLessThanOrEqual(finalState.hakProdusen.accruedRupiah);
    expect(finalState.payout.completedAmountRupiah).toBeLessThanOrEqual(finalState.hakProdusen.accruedRupiah);

    const transactions = await request(app).get('/api/admin/finance/transactions?limit=100').set('Cookie', superadmin);
    const kinds = new Set(transactions.body.items.map((row: { kind: string }) => row.kind));
    expect(kinds.has('ORDER')).toBe(true);
    expect(kinds.has('PAYOUT')).toBe(true);
    const payoutOnly = await request(app).get('/api/admin/finance/transactions?type=PAYOUT&limit=100').set('Cookie', superadmin);
    expect(payoutOnly.body.items.every((row: { kind: string }) => row.kind === 'PAYOUT')).toBe(true);
    expect(payoutOnly.body.items.length).toBeGreaterThan(0);
  });

  it('reports payout details and audit trail through the API', async () => {
    const detail = await request(app).get(`/api/admin/finance/payouts/${firstPayoutId}`).set('Cookie', superadmin);
    expect(detail.status).toBe(200);
    expect(detail.body.payout.amountRupiah).toBe(firstPayoutAmount);
    expect(detail.body.payout.partner.id).toBe(partnerOneId);
    expect(detail.body.payout.accruals.length).toBeGreaterThan(0);
    expect(detail.body.payout.accruals.every((row: { status: string }) => row.status === 'PAID')).toBe(true);
    expect(detail.body.payout.creator.role).toBe('SUPER_ADMIN');
    expect((await request(app).get(`/api/admin/finance/payouts/${firstPayoutId}`).set('Cookie', customer)).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/payouts/not-a-real-payout-id').set('Cookie', superadmin)).status).toBe(404);
    expect((await request(app).get('/api/admin/finance/payouts/bad%20id').set('Cookie', superadmin)).status).toBe(400);
    expect((await nazhirGet(`/api/nazhir/finance/payouts/${firstPayoutId}`)).status).toBe(200);
  });
});
