# Dapuremakita

Platform kurasi, pemasaran, dan pengelolaan produk UMKM terpilih. Batch 1 menyediakan foundation monorepo, autentikasi cookie HttpOnly, dan akses berbasis role. Batch 2 menambahkan public website dan katalog ACTIVE-only. Batch 3 menambahkan portal mitra dengan tenant isolation, legalitas, pengajuan produk, upload aman, HPP, kapasitas, dan riwayat revisi.

## Quick start

Prasyarat: Node.js 20+, npm, dan Docker (untuk PostgreSQL).

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
npm install
docker compose up -d postgres
npm run prisma:generate
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name foundation
npm run seed --workspace @dapuremakita/api
npm run dev
```

Web tersedia di `http://localhost:5173`, API di `http://localhost:3000`. Semua akun seed memakai password lokal `Demo123!`; jangan gunakan password tersebut di luar development.

Seed menyediakan dua akun PARTNER terisolasi: `partner@dapuremakita.local` dan `partner.two@dapuremakita.local`. Login PARTNER diarahkan ke `/portal/mitra`; subroute portal mencakup `/profil`, `/legalitas`, `/pengajuan`, `/pengajuan/new`, dan detail/edit pengajuan.

Kredensial PostgreSQL di `docker-compose.yml` (`dapuremakita` / `dapuremakita`) hanya untuk development lokal. Untuk deployment, gunakan secret manager, password unik, database private, dan `VITE_API_URL` yang menunjuk ke API HTTPS. `VITE_API_URL` kosong memakai proxy Vite development.

## Workspace

- `apps/api`: Express 5, TypeScript, Prisma PostgreSQL, Zod, bcrypt, JWT, cookie HttpOnly.
- `apps/web`: React 19 + Vite + TypeScript, website publik responsif berbahasa Indonesia dan auth CTA Batch 1.
- Portal mitra: seluruh endpoint `/api/partner` menurunkan owner dari session JWT; partner lain selalu 404 dan role non-PARTNER 403. File development disimpan di `var/uploads/`, dengan metadata object key saja di database.
- `docker-compose.yml`: PostgreSQL 16 lokal.

## Public API

`GET /public/categories`, `GET /public/products`, `GET /public/products/:slug`, dan `GET /public/partners` bersifat read-only. Katalog mendukung `search`, `category`, `page`, dan `limit` tervalidasi. Semua query produk memaksa `ProductStatus.ACTIVE` di server; product `DRAFT`, `REVIEW`, atau `INACTIVE` tidak tampil dan detail-nya 404.

Route website: `/`, `/katalog`, `/kategori/:slug`, `/katalog/:slug`, `/tentang`, `/kurasi`, `/mitra`, `/wakaf-produktif`, `/kemitraan`, dan `/login`. Detail implementasi dan hasil verifikasi ada di [BATCH_2_REPORT.md](BATCH_2_REPORT.md).

## Commands

`npm run lint`, `npm test`, `npm run build`, `npm run prisma:generate`, dan `npm audit --audit-level=high` menjalankan pemeriksaan utama. Detail foundation auth ada di [BATCH_1_REPORT.md](BATCH_1_REPORT.md), sedangkan scope public website ada di [BATCH_2_REPORT.md](BATCH_2_REPORT.md).

Smoke API setelah database aktif: `curl http://localhost:3000/health`, login dengan cookie jar (`curl -c /tmp/dm.cookies -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' -d '{"email":"partner@dapuremakita.local","password":"Demo123!"}' http://localhost:3000/auth/login`), lalu panggil `/auth/me` dan endpoint role dengan `-b /tmp/dm.cookies`. Logout memakai `POST /auth/logout` dan header `Origin` yang sama.

Detail scope dan hasil gate Batch 3 ada di [BATCH_3_REPORT.md](BATCH_3_REPORT.md).

## Admin dan kurasi Batch 4

Admin tersedia di `/admin` untuk role `SUPER_ADMIN`, `CURATOR`, dan `OPERATIONS`. CURATOR dapat memulai review, memberi score tujuh dimensi, menulis notes, meminta revisi, menolak, dan menyetujui setelah score mencapai threshold. OPERATIONS mengelola status mitra; finalisasi dan publish dibatasi `SUPER_ADMIN`.

Workflow submission: `SUBMITTED` -> `UNDER_REVIEW` -> `REVISION_REQUIRED` atau `APPROVED` -> `READY_TO_PUBLISH` -> `ACTIVE`. Publish membuat `Product` ACTIVE dan `ProductPublication` dalam satu transaksi; endpoint publik hanya membaca `ProductStatus.ACTIVE`. Finalisasi hanya menyimpan data final, sehingga tidak ada product draft yang dapat menghalangi publish.

Migration Batch 4 memetakan `IN_REVIEW` ke `UNDER_REVIEW` sebelum enum lama dihapus. Migration berikutnya menghapus `ProductStatus.REVIEW` dengan pemetaan aman ke `UNDER_REVIEW`. Jalankan `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` tanpa reset database. Seed development idempotent dan telah diverifikasi dua kali.

Detail implementasi dan hasil audit/gate Batch 4 ada di [BATCH_4_REPORT.md](BATCH_4_REPORT.md).
