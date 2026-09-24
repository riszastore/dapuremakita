import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:3000';

/**
 * Proxy development: semua jalur API diteruskan ke API, termasuk `/public` (katalog) dan
 * `/orders` (pembayaran/status order). `/checkout` sengaja TIDAK diproxy karena jalur SPA
 * `/checkout` harus tetap dilayani oleh web; frontend memakai alias `POST /api/checkout`.
 */
const pagesPreview = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
	base: pagesPreview ? '/dapuremakita/' : '/',
	plugins: [react()],
	server: {
		host: '0.0.0.0',
		proxy: { '/auth': api, '/api': api, '/public': api, '/orders': api, '/health': api, '/uploads': api }
	}
});
