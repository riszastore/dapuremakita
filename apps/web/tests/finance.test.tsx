import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/main';

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

const summary = {
  producerShareBps: 8000,
  omzet: { productRupiah: 600000, shippingRupiah: 46000, totalRupiah: 646000, orderCount: 4, itemCount: 6, quantitySold: 7 },
  hakProdusen: { accruedRupiah: 516800, availableRupiah: 300000, reservedRupiah: 100000, paidRupiah: 116800, pendingRupiah: 400000, partnerCount: 2, accrualCount: 6 },
  margin: { totalRupiah: 129200, productRupiah: 83200, shippingRupiah: 46000 },
  payout: { pendingAmountRupiah: 100000, completedAmountRupiah: 116800, cancelledAmountRupiah: 0, pendingCount: 1, completedCount: 1, cancelledCount: 0 },
  breakdown: { ordersByStatus: [{ status: 'PAID', count: 4 }], distinctProducts: 3 },
  checks: { identityHold: true, marginNonNegative: true, payoutWithinHak: true },
};

const mockFetch = (user: { name: string; email: string; role: string }, options: { session?: boolean } = {}) => {
  let session = options.session ?? true;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return session ? response({ user }) : response({ error: 'Authentication required' }, 401);
    if (url.endsWith('/auth/login')) { session = true; return response({ user }); }
    if (url.endsWith('/auth/logout')) { session = false; return response(null, 204); }
    if (url.includes('/finance/summary')) return response({ summary });
    if (url.includes('/finance/transactions')) return response({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
    if (url.includes('/finance/accruals')) return response({ items: [], page: 1, limit: 20, total: 0, totalPages: 1, totals: [] });
    if (url.includes('/finance/payouts')) return response({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
    if (url.includes('/finance/reports/products')) return response({ items: [], total: 0 });
    if (url.includes('/finance/reports/partners')) return response({ items: [], total: 0 });
    if (url.includes('/finance/reports/impact')) return response({ totals: { omzetRupiah: 646000, hakProdusenRupiah: 516800, marginRupiah: 129200, payoutPaidRupiah: 116800, payoutPendingRupiah: 100000 }, reach: { orderCount: 4, orderItemCount: 6, quantitySold: 7, distinctProducts: 3, partnersWithHak: 2, partnersPaid: 1, activeProducts: 3, categories: 2 }, fulfilment: { ordersByStatus: [], itemsByProductionStatus: [] }, provinces: [], checks: summary.checks });
    if (url.includes('/api/admin/partners')) return response({ items: [{ id: 'p1', name: 'Dapur Ibu Nusantara' }] });
    return response({ error: 'Not found' }, 404);
  });
};

beforeEach(() => { vi.restoreAllMocks(); window.history.pushState({}, '', '/'); });
afterEach(() => cleanup());

/** Ganti route SPA setelah render: pushState + popstate seperti navigasi aplikasi. */
const go = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

describe('nazhir viewer dashboard is read-only', () => {
  it('renders every finance panel with GET requests only and no write controls', async () => {
    const fetchMock = mockFetch({ name: 'Nazhir Viewer Demo', email: 'nazhir@dapuremakita.local', role: 'NAZHIR_VIEWER' });
    window.history.pushState({}, '', '/nazhir');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Nazhir Viewer Demo' })).toBeTruthy();
    expect(screen.getByText('Dashboard nazhir')).toBeTruthy();
    expect(await screen.findByText('Omzet')).toBeTruthy();
    expect(screen.getByText(/646[^\d]*000/)).toBeTruthy();
    expect(screen.getByText(/Tampilan baca-sahaja/)).toBeTruthy();
    expect(screen.getByText(/seluruh perhitungan dan pencatatan dilakukan oleh server/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Buat payout/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tandai dibayar' })).toBeNull();
    const writes = fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') !== 'GET');
    expect(writes).toHaveLength(0);

    go('/nazhir/payout');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Payout' })).toBeTruthy());
    expect(screen.getByText('Belum ada payout.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Buat payout/ })).toBeNull();
  });

  it('hides the dashboard from accounts that are not nazhir viewers', async () => {
    mockFetch({ name: 'Super Admin', email: 'superadmin@dapuremakita.local', role: 'SUPER_ADMIN' });
    window.history.pushState({}, '', '/nazhir');
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/hanya untuk akun Nazhir Viewer/);
  });
});

describe('admin finance dashboard authorization', () => {
  it('lets SUPER_ADMIN open finance with payout controls', async () => {
    mockFetch({ name: 'Super Admin', email: 'superadmin@dapuremakita.local', role: 'SUPER_ADMIN' });
    window.history.pushState({}, '', '/admin/keuangan');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ringkasan finance' })).toBeTruthy();
    expect(await screen.findByText('Omzet = hak produsen + margin')).toBeTruthy();
    expect(await screen.findByText('Payout tidak melebihi hak')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Laporan dampak/ })).toBeTruthy();
    go('/admin/keuangan/payout');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Payout' })).toBeTruthy());
    expect(await screen.findByRole('button', { name: /Buat payout dari hak tersedia/ })).toBeTruthy();
  });

  it('keeps OPERATIONS read-only and blocks CURATOR from finance entirely', async () => {
    mockFetch({ name: 'Operations Demo', email: 'operations@dapuremakita.local', role: 'OPERATIONS' });
    window.history.pushState({}, '', '/admin/keuangan/payout');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Payout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Buat payout/ })).toBeNull();
    cleanup();

    mockFetch({ name: 'Curator Demo', email: 'curator@dapuremakita.local', role: 'CURATOR' });
    window.history.pushState({}, '', '/admin/keuangan');
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/SUPER_ADMIN dan OPERATIONS/);
  });
});

describe('login NAZHIR_VIEWER diarahkan ke /nazhir', () => {
  it('form login membawa sesi nazhir ke dashboard baca-sahaja hanya dengan satu POST login', async () => {
    const fetchMock = mockFetch({ name: 'Nazhir Viewer Demo', email: 'nazhir@dapuremakita.local', role: 'NAZHIR_VIEWER' }, { session: false });
    window.history.pushState({}, '', '/login');
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'nazhir@dapuremakita.local' } });
    fireEvent.change(screen.getByLabelText('Kata sandi'), { target: { value: 'Demo123!' } });
    fireEvent.click(screen.getByRole('button', { name: /Masuk/ }));

    expect(await screen.findByRole('heading', { name: 'Nazhir Viewer Demo' })).toBeTruthy();
    expect(window.location.pathname).toBe('/nazhir');
    expect(screen.getByText('Dashboard nazhir')).toBeTruthy();
    expect(screen.getByText(/Tampilan baca-sahaja/)).toBeTruthy();

    const writes = fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') !== 'GET');
    expect(writes).toHaveLength(1);
    expect(String(writes[0]?.[0])).toContain('/auth/login');
  });
});
