import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/main';

const user = { name: 'Partner Demo', email: 'partner@test.local', role: 'PARTNER' };
const response = (body: unknown, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { cleanup(); });

describe('login and session smoke', () => {
	it('bootstraps anonymous session and renders Indonesian login form', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(response({}, 401) as never);
		render(<App />);
		expect(screen.getByRole('status').textContent).toContain('Memeriksa sesi...');
		expect((await screen.findByText('Masuk ke ruang kerja')).textContent).toContain('Masuk ke ruang kerja');
		expect(fetchMock).toHaveBeenCalledWith('/auth/me', { credentials: 'include' });
	});
	it('restores a valid session after refresh', async () => {
		vi.spyOn(globalThis, 'fetch').mockReturnValue(response({ user }) as never);
		render(<App />);
		expect((await screen.findByText('Partner Demo')).textContent).toContain('Partner Demo');
		expect(screen.getByText(/Mitra/).textContent).toContain('Mitra');
	});
	it('shows login failure and then supports successful login', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch')
			.mockReturnValueOnce(response({}, 401) as never)
			.mockReturnValueOnce(response({ error: 'Invalid email or password' }, 401) as never)
			.mockReturnValueOnce(response({ user }) as never);
		render(<App />);
		await screen.findByText('Masuk ke ruang kerja');
		fireEvent.change(screen.getByLabelText('Email'), { target: { value: user.email } });
		fireEvent.change(screen.getByLabelText('Kata sandi'), { target: { value: 'wrong' } });
		fireEvent.click(screen.getByRole('button', { name: /Masuk/ }));
		expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password');
		fireEvent.change(screen.getByLabelText('Kata sandi'), { target: { value: 'Demo123!' } });
		fireEvent.click(screen.getByRole('button', { name: /Masuk/ }));
		expect((await screen.findByText('Partner Demo')).textContent).toContain('Partner Demo');
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
	it('logs out and clears the authenticated view', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockReturnValueOnce(response({ user }) as never)
			.mockReturnValueOnce(response({}, 204) as never);
		render(<App />);
		await screen.findByText('Partner Demo');
		fireEvent.click(screen.getByRole('button', { name: /Keluar/ }));
		await waitFor(() => expect(screen.getByText('Masuk ke ruang kerja')).toBeTruthy());
	});
	it('shows a recoverable session bootstrap error', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
		render(<App />);
		expect((await screen.findByRole('alert')).textContent).toContain('Sesi tidak dapat diperiksa');
	});
});
