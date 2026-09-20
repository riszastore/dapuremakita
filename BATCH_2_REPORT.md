# Batch 2 Report: Public Website

## Scope

Batch 2 menambahkan website publik Dapuremakita dalam bahasa Indonesia:

- Homepage dengan hero, produk unggulan, alur kurasi, dan CTA kemitraan.
- Homepage mengambil kategori dan produk unggulan dari public API; tidak ada produk hardcoded yang dapat melewati ACTIVE filter.
- Katalog dengan search, filter kategori, pagination controls, loading/error/empty state.
- Route kategori eksplisit `/kategori/:slug` dengan not-found state.
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
- Web DOM tests: 9 passed, mencakup semua halaman, category/detail/404, search/filter/pagination, loading/error/empty, SEO metadata, mobile menu/focus, dan auth compatibility.
- Workspace lint: passed.
- Workspace production build: passed.
- Prisma validate: passed.
- Migration deploy and seed: passed against PostgreSQL 16.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Runtime smoke: `/health` returned `{"status":"ok"}`; categories, combined search/category/pagination returned the expected active product; REVIEW detail returned HTTP 404; all SPA routes served successfully.
- Seed dijalankan dua kali terhadap PostgreSQL 16 tanpa error; seluruh seed memakai upsert deterministik.
- API app factory memakai satu Prisma client untuk default auth dan public catalog repositories.

Known local limitation: environment ini tidak menyediakan Chromium/Playwright, sehingga browser automation/screenshot tidak dapat dijalankan. Sebagai pengganti yang dapat direproduksi, DOM interaction suite jsdom berjalan 9/9 dan runtime Vite/API route smoke berjalan terhadap services nyata.
