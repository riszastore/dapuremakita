import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:3000';

/**
 * Proxy development: semua jalur API diteruskan ke API, termasuk `/public` (katalog) dan
 * `/orders` (pembayaran/status order). `/checkout` sengaja TIDAK diproxy karena jalur SPA
 * `/checkout` harus tetap dilayani oleh web; frontend memakai alias `POST /api/checkout`.
 */
export default defineConfig({
	plugins: [react()],
	server: { proxy: { '/auth': api, '/api': api, '/public': api, '/orders': api, '/health': api } }
});
