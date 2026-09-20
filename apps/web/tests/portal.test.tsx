import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/main';

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const partner = { id: 'u1', name: 'Mitra Satu', email: 'one@test.local', role: 'PARTNER' };
const auth = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = String(input);
  if (url.endsWith('/auth/me')) return response({ user: partner });
  if (url.includes('/api/partner/overview')) return response({ partner: { name: 'Dapur Satu' }, counts: { drafts: 1, submitted: 2, documents: 3, profile: 1 } });
  if (url.includes('/api/partner/profile')) return response({ profile: { contactName: 'Mitra Satu', phone: '081234567890', address: 'Jalan Satu', city: 'Bandung', province: 'Jawa Barat', postalCode: '40111' } });
  if (url.includes('/api/partner/legal-documents')) return response({ documents: [] });
  if (url.includes('/api/partner/submissions')) return response({ submissions: [] });
  if (url.includes('/api/partner/categories')) return response({ categories: [{ id: 'cat1', name: 'Pangan', slug: 'pangan' }] });
  return response({}, 404);
});

beforeEach(() => { window.history.pushState({}, '', '/portal/mitra'); vi.restoreAllMocks(); });
afterEach(() => cleanup());

describe('partner portal DOM routes', () => {
  it('guards role and renders dashboard with accessible mobile navigation', async () => {
    const fetchMock = auth();
    render(<App />);
    expect(await screen.findByRole('heading', { name: /Dashboard mitra/ })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navigasi portal' })).toBeTruthy();
    expect(await screen.findByText('Pengajuan aktif')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Buka navigasi portal' }));
    expect(screen.getByRole('button', { name: 'Tutup navigasi portal' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('renders and saves validated profile', async () => {
    const fetchMock = auth();
    window.history.pushState({}, '', '/portal/mitra/profil');
    render(<App />);
    const phone = await screen.findByDisplayValue('081234567890');
    fireEvent.change(phone, { target: { value: '081234567899' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan profil' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).includes('/api/partner/profile') && (init as RequestInit)?.method === 'PUT')).toBe(true));
  });

  it('renders empty legal state and submits multipart upload', async () => {
    const fetchMock = auth();
    window.history.pushState({}, '', '/portal/mitra/legalitas');
    render(<App />);
    expect(await screen.findByText('Belum ada dokumen legalitas.')).toBeTruthy();
    const file = new File(['%PDF-1.4'], 'legal.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('File PDF/JPEG/PNG'), { target: { files: [file] } });
    await waitFor(() => expect((screen.getByLabelText('File PDF/JPEG/PNG') as HTMLInputElement).files?.[0]).toBe(file));
    fireEvent.submit(screen.getByRole('button', { name: 'Upload' }).closest('form')!);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('renders submission form and numeric controls without privileged status input', async () => {
    auth();
    window.history.pushState({}, '', '/portal/mitra/pengajuan/new');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /Pengajuan produk baru/ })).toBeTruthy();
    expect(screen.getByLabelText('HPP (rupiah)').getAttribute('min')).toBe('1');
    expect(screen.queryByLabelText(/status/i)).toBeNull();
    expect(screen.getByText('Pilih kategori')).toBeTruthy();
  });
});
