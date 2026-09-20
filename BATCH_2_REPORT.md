# Batch 2 Report: Public Website

## Scope

Batch 2 menambahkan website publik Dapuremakita dalam bahasa Indonesia:

- Homepage dengan hero, produk unggulan, alur kurasi, dan CTA kemitraan.
- Katalog dengan search, filter kategori, pagination contract, loading/error/empty state.
- Detail produk berdasarkan slug, route 404, format Rupiah, dan state not-found.
- Halaman Tentang, Kurasi, Mitra, Wakaf Produktif, dan Kemitraan.
- Responsive desktop/tablet/mobile layout, semantic HTML, visible keyboard focus, dan mobile navigation.
- SEO dasar: title dan meta description untuk setiap route.
- Auth Batch 1 tetap tersedia melalui session-aware CTA homepage dan `/login`.

## Data and API

Prisma menambahkan `Category`, `Partner`, `Product`, dan enum `ProductStatus` (`DRAFT`, `REVIEW`, `ACTIVE`, `INACTIVE`). Product memiliki slug unik, harga integer Rupiah, deskripsi, image URL lokal/placeholder, kategori, dan partner opsional.

Public read-only endpoints:

- `GET /public/categories`
- `GET /public/products?search=&category=&page=&limit=`
- `GET /public/products/:slug`
- `GET /public/partners`

Repository memaksa `status: ACTIVE` pada query list dan detail. Product non-ACTIVE tidak dikembalikan dan detail-nya menjadi 404. Seed deterministik berisi tiga product ACTIVE dan satu product REVIEW (`teh-rempah-draft`) untuk pembuktian filter.

## Verification

- API tests: 15 passed.
- Web tests: 5 passed.
- Workspace lint: passed.
- Workspace production build: passed.
- Prisma validate: passed.
- Migration deploy and seed: passed against PostgreSQL 16.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Runtime smoke: `/health` returned `{"status":"ok"}`; public catalog returned 3 ACTIVE products; REVIEW detail returned HTTP 404.

Known local limitation: browser visual smoke was exercised through the running Vite/API services and HTTP endpoint checks; no browser automation dependency exists in the repository.
