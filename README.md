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

## Order dan checkout Batch 5

Keranjang publik memakai `localStorage` key `dapuremakita.cart.v1` dan mendukung tambah, ubah jumlah, hapus, serta kosongkan. Route web checkout tamu adalah `/cart`, `/checkout`, `/checkout/:orderNumber/bayar`, dan `/order/:orderNumber`. Server selalu mengambil ulang produk ACTIVE dan harga saat `POST /checkout`; field harga atau total dari klien tidak dipercaya. Harga disimpan sebagai integer rupiah pada snapshot `OrderItem`, bersama nama dan slug produk.

Endpoint utama:

- `POST /checkout` membuat order `PENDING_PAYMENT` secara transaksional dengan `idempotencyKey` unik.
- `POST /orders/:id/payment` menjalankan mock payment sukses/gagal secara idempotent.
- `GET /orders/:orderNumber` menampilkan status dan riwayat order.
- `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `PATCH /api/admin/orders/:id/status`, dan `PATCH /api/admin/order-items/:id/assignment` untuk `SUPER_ADMIN`/`OPERATIONS`.
- `GET /api/partner/orders` dan `PATCH /api/partner/order-items/:id/status` hanya menampilkan item partner yang ditugaskan dan hanya mengizinkan status produksi berikutnya. Item partner lain selalu 404.

Order lifecycle yang diizinkan adalah `PENDING_PAYMENT -> PAID -> PROCESSING -> PRODUCTION -> QC -> READY -> SHIPPED -> DELIVERED`, dengan pembatalan eksplisit sebelum delivered. Semua perubahan admin tercatat di `OrderStatusHistory`; data nama, slug, harga, jumlah, dan total item adalah snapshot immutable. Migration `20260922130000_batch5_orders_checkout` forward-only dan diterapkan dengan `npx prisma migrate deploy`, tanpa reset database. Detail arsitektur dan hasil gate ada di [BATCH_5_REPORT.md](BATCH_5_REPORT.md).

## Finance dan Nazhir Batch 6

Rantai finance selalu `ORDER -> ORDER ITEM -> OMZET -> HAK PRODUSEN -> MARGIN DAPUREMAKITA -> PAYOUT`, dihitung sepenuhnya oleh backend dalam integer rupiah. Order sah adalah order dengan `paymentStatus = SUCCEEDED` dan `status != CANCELLED`; order gagal, tertunda, dan dibatalkan tidak pernah masuk omzet maupun riwayat transaksi.

- Omzet = `SUM(totalRupiah)` order sah = omzet produk + omzet pengiriman (filter periode memakai `paidAt`).
- Hak produsen per item = `floor((lineTotal × producerShareBps + 5000) / 10000)`, `producerShareBps` disimpan di `FinanceSetting` (default `8000` = 80%) dan dimaterialisasi sebagai `FinanceAccrual` unik per `orderItemId`.
- Margin Dapuremakita = `omzet − hak produsen`; identitas `omzet = hak + margin` diperiksa di setiap ringkasan dan laporan.
- Payout memilih hak `AVAILABLE` milik mitra di dalam transaksi ber-`FOR UPDATE`, menghitung nominal di server, menahannya sebagai `RESERVED`, lalu `COMPLETED` (hak menjadi `PAID`) atau `CANCELLED` (hak kembali tersedia). `idempotencyKey` unik dan payout tidak pernah melebihi hak tersedia.
- Item order yang sudah memiliki akresi tidak dapat dialihkan ke mitra lain (409), sehingga tidak ada double counting.

Endpoint admin: `GET /api/admin/finance/{summary,transactions,accruals,payouts,payouts/:id,reports/products,reports/partners,reports/impact}` untuk `SUPER_ADMIN`/`OPERATIONS`, serta `POST /api/admin/finance/payouts` dan `POST /api/admin/finance/payouts/:id/{complete,cancel}` hanya untuk `SUPER_ADMIN` dengan `requireSameOrigin`. Mitra membaca angkanya sendiri lewat `GET /api/partner/finance`.

Nazhir memakai `GET /api/nazhir/finance/*` yang hanya berisi route GET untuk `NAZHIR_VIEWER`, ditambah middleware global `readOnlyAccountGuard` yang menolak 403 `Read-only account` pada request non-GET akun `NAZHIR_VIEWER` (di luar `/auth/`), sehingga read-only dijamin di backend. Halaman web: `/admin/keuangan`, `/admin/keuangan/{transaksi,hak,payout}`, `/admin/laporan/{produk,mitra,dampak}`, dan dashboard `/nazhir` beserta tabnya. Migration `20260922150000_batch6_finance` forward-only; detail hasil gate ada di [BATCH_6_REPORT.md](BATCH_6_REPORT.md).

Kebijakan asal request dipusatkan di `apps/api/src/middleware/origin.ts` dan dipakai bersama oleh CORS maupun `requireSameOrigin`: `CORS_ORIGIN`, daftar tambahan `CORS_ORIGINS` (opsional, dipisah koma), origin API itu sendiri, dan padanan loopback `localhost`/`127.0.0.1`/`[::1]` pada port yang sama; bila browser tidak mengirim Origin/Referer, `Sec-Fetch-Site: same-origin|none` diterima. Request lintas situs dan klien tanpa asal tetap 403. Proxy Vite development meneruskan `/auth`, `/api`, `/public`, `/orders`, dan `/health` (jalur checkout memakai alias `POST /api/checkout`, sehingga `GET /checkout` tetap halaman SPA). Login tiap peran, logout/re-login, proteksi write Nazhir, dan matriks origin diuji di `apps/api/tests/login.test.ts` serta lewat runtime acceptance 64 pemeriksaan yang hasilnya dicatat di laporan.
