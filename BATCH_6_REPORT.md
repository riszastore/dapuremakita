# Batch 6: Finance, Reporting, dan Nazhir View

Status: **PASS** — seluruh scope, gate, real runtime acceptance test, review/repair selesai. Tidak ada blocker.

## Akar masalah login 403 "Forbidden" (repair pass)

Reproduksi runtime nyata (bukan tebakan) menelusuri `POST /auth/login` sampai middleware:

```
POST /auth/login
  -> app.ts            app.use('/auth', authRouter(authService))
  -> routes/auth.ts    router.post('/login', requireSameOrigin, …)   <- titik 403
  -> middleware/auth.ts  requireSameOrigin -> HttpError(403, 'Forbidden')
```

`readOnlyAccountGuard` tidak ikut serta: guard melewatkan seluruh path yang diawali `/auth/` sehingga login/logout tidak pernah kena `Read-only account`. Penyebab sebenarnya ada di `requireSameOrigin`, yang **hanya membandingkan dengan satu string `CORS_ORIGIN`** (`http://localhost:5173`). Bukti dari server berjalan:

| Origin/Referer yang dikirim browser | Sebelum | Sesudah |
| --- | --- | --- |
| `http://localhost:5173` | 200 | 200 |
| `http://127.0.0.1:5173` | **403 Forbidden** | 200 |
| `Referer: http://127.0.0.1:5173/login` tanpa Origin | **403 Forbidden** | 200 |
| browser modern hanya `Sec-Fetch-Site: same-origin` | **403 Forbidden** | 200 |
| `https://evil.example` (lintas situs) | 403 | 403 (CSRF tetap terjaga) |
| tanpa Origin/Referer sama sekali | 403 | 403 (paritas Batch 1) |

Perbaikan akar masalah, bukan workaround UI:

- `apps/api/src/middleware/origin.ts` (baru): kebijakan origin terpusat untuk CORS **dan** `requireSameOrigin` — mengizinkan `CORS_ORIGIN`, daftar tambahan `CORS_ORIGINS` (opsional, dipisah koma untuk URL preview/forwarded), origin API itu sendiri, serta padanan loopback `localhost`/`127.0.0.1`/`[::1]` pada port yang sama. Bila browser tidak mengirim Origin/Referer, `Sec-Fetch-Site: same-origin|none` diterima; klien tanpa identitas asal tetap 403.
- `apps/api/src/config.ts`: menambah `CORS_ORIGINS` opsional; `apps/api/src/app.ts` memakai `cors({ origin: corsOriginCallback })` sehingga header CORS dan aturan login selalu sejaga.
- Runtime web diperbaiki di jalur yang sama: proxy Vite kini meneruskan `/public` dan `/orders` (sebelumnya katalog dan status/pembayaran order mengembalikan HTML SPA), dan `POST /checkout` tersedia juga sebagai alias `POST /api/checkout` (`apps/api/src/routes/order.ts`) sehingga jalur tulis tetap mencapai guard backend dan membalas 403 `Read-only account` lewat origin web.

## Scope yang diselesaikan

1. Omzet
2. Hak produsen
3. Margin Dapuremakita
4. Payout
5. Riwayat transaksi
6. Laporan produk
7. Laporan mitra
8. Laporan dampak
9. Dashboard Nazhir Viewer (read-only)

## Model keuangan (backend sebagai satu-satunya sumber kebenaran)

Rantai selalu `ORDER -> ORDER ITEM -> OMZET -> HAK PRODUSEN -> MARGIN DAPUREMAKITA -> PAYOUT`. Seluruh angka dihitung dalam integer rupiah di backend; klien tidak pernah mengirim nominal finance.

- **Order sah secara finansial**: `paymentStatus = SUCCEEDED` dan `status != CANCELLED`. Order gagal bayar, belum bayar, dan dibatalkan tidak pernah masuk omzet. Order yang sudah `SUCCEEDED` tidak dapat dibatalkan (409), sehingga kelayakan bersifat monoton.
- **Omzet** = `SUM(totalRupiah)` order sah = omzet produk (`subtotalRupiah`) + omzet pengiriman (`shippingRupiah`). Filter periode memakai `paidAt` (hari, UTC).
- **Hak produsen per item** = `floor((lineTotalRupiah × producerShareBps + 5000) / 10000)` dengan pembulatan integer; `producerShareBps` disimpan pada `FinanceSetting` (id `default`, default `8000` = 80%).
- **Hak produsen kumulatif** = jumlah akresi per item pada order sah, dengan status `AVAILABLE`, `RESERVED`, atau `PAID`.
- **Margin Dapuremakita** = `omzet − hak produsen kumulatif`.
- Identitas yang selalu diperiksa di setiap respons ringkasan/laporan: `omzet = hak produsen + margin`, `margin ≥ 0`, dan `payout COMPLETED ≤ hak produsen`.

Akresi (`FinanceAccrual`) dimaterialisasi per `orderItemId` dengan `UNIQUE(orderItemId)` + `skipDuplicates`, dipicu saat pembayaran sukses, saat penugasan mitra, dan secara lazy (`ensureAccruals()`) pada setiap pembacaan finance serta seed. Item order yang sudah memiliki akresi tidak dapat dialihkan ke mitra lain (409) sehingga tidak ada double counting.

## Payout

- Pembuatan payout mengunci baris `FinanceAccrual` dengan `SELECT … FOR UPDATE`, lalu memilih seluruh hak `AVAILABLE` milik mitra (atau daftar `accrualIds` eksplisit milik mitra itu juga).
- Nilai payout = `SUM(amountRupiah)` hak yang terkunci — dihitung server; body klien bersifat `strict` sehingga `amountRupiah` dari klien menghasilkan 400.
- Hak berubah `AVAILABLE -> RESERVED` dan tertaut ke payout; total payout dibatuh tidak pernah melebihi hak tersedia (identitas `payoutWithinHak`).
- `idempotencyKey` unik: replay mengembalikan payout yang sama (200, `idempotent: true`), bukan payout baru.
- `PENDING -> COMPLETED` menandai seluruh hak `RESERVED` milik payout menjadi `PAID`; `PENDING -> CANCELLED` melepas hak kembali ke `AVAILABLE` dan `payoutId = null`.
- Dua payout paralel tidak dapat mengklaim hak yang sama: kalah kunci menghasilkan 409.
- Setiap aksi menulis `AuditLog` (`PAYOUT_CREATED`, `PAYOUT_COMPLETED`, `PAYOUT_CANCELLED`).

## Schema dan migration

Migration `20260922150000_batch6_finance` (setelah `20260922130000_batch5_orders_checkout`), hanya menambah objek baru: enum `FinanceAccrualStatus` (`AVAILABLE`/`RESERVED`/`PAID`), enum `PayoutStatus` (`PENDING`/`COMPLETED`/`CANCELLED`), tabel `FinanceSetting`, `FinanceAccrual`, `Payout`, relasi balik pada `User`, `Partner`, `Order`, dan `OrderItem`. Diterapkan forward-only tanpa reset atau delete.

- `prisma migrate status`: `Database schema is up to date!` (7 migrations).
- `prisma migrate diff --from-migrations … --shadow-database-url dapuremakita_shadow_check`: `No difference detected.`
- Seed idempotent dan dijalankan dua kali: `7 users, 4 products`, `FinanceSetting` di-upsert, akresi lama di-backfill tanpa duplikat.
- Konfigurasi `apps/api/src/config.ts` membaca `.env` relatif terhadap lokasi file, sehingga `npm test`, `npx vitest --root`, maupun server dev memakai berkas konfigurasi yang sama terlepas dari working directory.

## Endpoint

Admin (`SUPER_ADMIN`/`OPERATIONS` membaca, `SUPER_ADMIN` menulis):

- `GET /api/admin/finance/summary` — omzet, hak produsen, margin, payout, breakdown, checks.
- `GET /api/admin/finance/transactions?type=ORDER|PAYOUT` — riwayat gabungan order sah dan payout.
- `GET /api/admin/finance/accruals` — hak produsen per item dengan total per status.
- `GET /api/admin/finance/payouts`, `GET /api/admin/finance/payouts/:id` — daftar dan detail payout beserta akresi terkait.
- `POST /api/admin/finance/payouts`, `POST /api/admin/finance/payouts/:id/complete`, `POST /api/admin/finance/payouts/:id/cancel` — hanya `SUPER_ADMIN`, dengan `requireSameOrigin`.
- `GET /api/admin/finance/reports/products`, `GET /api/admin/finance/reports/partners`, `GET /api/admin/finance/reports/impact`.
- `GET /api/partner/finance` — hanya angka mitra sendiri (tenant isolation).

Nazhir (GET saja): `GET /api/nazhir/finance/summary|transactions|accruals|payouts|payouts/:id|reports/products|reports/partners|reports/impact`.

Seluruh endpoint finance menerima `from`/`to` (`YYYY-MM-DD`, `from <= to`) dan pagination `page`/`limit`; input tidak valid menghasilkan 400.

## Otorisasi dan read-only Nazhir

- Finance admin: `SUPER_ADMIN` dan `OPERATIONS` membaca, selain itu 401/403 (customer, curator, partner, nazhir).
- Payout write: hanya `SUPER_ADMIN`; `OPERATIONS`, `CURATOR`, `PARTNER`, `NAZHIR_VIEWER` mendapat 403.
- `readOnlyAccountGuard` dipasang global di `app.ts`: seluruh request non-GET dari akun `NAZHIR_VIEWER` (kecuali `/auth/`) ditolak 403 `Read-only account`, sehingga read-only berlaku di backend untuk seluruh route, bukan hanya tampilan.
- Router `/api/nazhir/finance` hanya memuat route GET dan dibatasi `requireRoles('NAZHIR_VIEWER')`; akun lain mendapat 403.
- Partner finance selalu scoped ke `partnerId` milik sesi; mitra lain selalu 0/0.

## Halaman web

- `/admin/keuangan`, `/admin/keuangan/transaksi`, `/admin/keuangan/hak`, `/admin/keuangan/payout`, `/admin/laporan/produk`, `/admin/laporan/mitra`, `/admin/laporan/dampak` dengan tab finance bersama (`apps/web/src/finance.tsx`).
- Form payout (SUPER_ADMIN) hanya memilih mitra; nominal tetap dihitung server. OPERATIONS melihat panel yang sama tanpa kontrol tulis.
- `/nazhir`, `/nazhir/transaksi`, `/nazhir/hak`, `/nazhir/payout`, `/nazhir/laporan/produk`, `/nazhir/laporan/mitra`, `/nazhir/laporan/dampak` memakai `NazhirApp` dengan `canWrite={false}`, tanpa tombol aksi, dan hanya memanggil `GET /api/nazhir/finance`.
- Login `NAZHIR_VIEWER` diarahkan ke `/nazhir`; area finance admin menampilkan penjolakan akses untuk role tanpa hak.

## Runtime Acceptance Test

Dijalankan sungguhan terhadap server berjalan (web `http://localhost:5173` → proxy → API `http://localhost:3000`), memakai cookie jar per peran dan header identik dengan browser (`Origin` + `Referer`). Skrip: **64 pemeriksaan, 64 PASS, 0 FAIL**.

| Pemeriksaan | Hasil |
| --- | --- |
| SUPER_ADMIN login: | **PASS** |
| OPERATIONS login: | **PASS** |
| PARTNER login: | **PASS** |
| NAZHIR_VIEWER login: | **PASS** |
| Nazhir redirect /nazhir: | **PASS** |
| Nazhir finance GET: | **PASS** |
| Nazhir write request: 403 PASS | **PASS** |
| logout/re-login: | **PASS** |

Rincian yang benar-benar dieksekusi:

- **SUPER_ADMIN**: login 200 + `Set-Cookie: dm_auth … HttpOnly`; `/auth/me` = `SUPER_ADMIN`; `GET /api/admin/finance/summary|transactions|reports/impact` 200; payout dibuat 201 dengan nominal dihitung server (≤ hak tersedia), payout kedua di atas hak tersisa 409, `cancel` 200; logout 204 → `/auth/me` 401 → re-login 200.
- **OPERATIONS**: login 200, `/auth/me` = `OPERATIONS`, `GET /api/admin/finance/summary` 200, `POST /api/admin/finance/payouts` 403.
- **PARTNER**: login 200, `GET /api/partner/finance` 200 dan sama persis dengan baris mitra tersebut pada laporan admin (hak 2.879.200), mitra kedua melihat 0 — pemisahan tenant berbeda sesungguhnya; `GET /api/admin/finance/summary|accruals` dan `GET /api/nazhir/finance/*` 403.
- **NAZHIR_VIEWER**: login 200 + cookie HttpOnly; `/auth/me` = `NAZHIR_VIEWER` (target rute `/nazhir`); `GET /api/nazhir/overview` serta `finance/summary|transactions|accruals|payouts|reports/products|reports/partners|reports/impact` 200; `GET /api/admin/finance/summary` dan `/api/partner/finance` 403; `POST payout`, `POST /api/checkout`, `POST /api/orders/:id/payment`, `POST /orders/:id/payment`, `PATCH /api/admin/orders/:id/status`, `PUT /api/partner/profile` semuanya **403 `Read-only account`**; logout 204 → `/auth/me` 401 → re-login 200 → summary 200 lagi.
- **Origin/CSRF**: login dengan `Origin: http://127.0.0.1:5173` 200 (sebelumnya 403 `Forbidden`) dan session-nya valid; origin lintas situs 403; tanpa Origin/Referer 403.
- **Runtime web**: `/public/products` lewat origin web kembali JSON API, `GET /checkout` tetap halaman SPA, `POST /api/checkout` anonim tervalidasi API (400, bukan 404), `GET /orders/…` tak dikenal 404 API.
- **Smoke pasca-uji (nilai final setelah seluruh test suite)**: `/health` ok; summary admin `omzet 4.185.000 = hak 3.348.000 + margin 837.000` dengan `checks {identityHold, marginNonNegative, payoutWithinHak} = true`; summary nazhir 200; POST payout nazhir 403 `Read-only account`.

Catatan: otomasi browser desktop tidak tersedia pada sesi ini, sehingga redirect `/nazhir` dibuktikan lewat regresi web jsdom (form login `NAZHIR_VIEWER` → `window.location.pathname === '/nazhir'` → dashboard baca-sahaja, dengan satu-satunya request non-GET adalah `POST /auth/login`) dan seluruh aspek server dibuktikan lewat HTTP runtime nyata dengan cookie jar seperti di atas.

## Hasil gate (final)

- Lint API + web: **PASS** (0 error).
- Typecheck API (`tsc --noEmit`) + web (`tsc -b`): **PASS**.
- API tests: **49/49** (6 files) — 38 test Batch 6 (omzet/hak/margin benar, order tak sah dikeluarkan dari omzet dan riwayat, akresi akurat tanpa duplikat, konsistensi laporan produk/mitra/dampak, range tanggal, matriks otorisasi, matriks read-only Nazhir, isolasi tenant, guard reassignment, payout capped/idempoten/race/lifecycle/audit) **plus 11 test baru `tests/login.test.ts`** (login tiap peran, cookie HttpOnly, panel nazhir, write 403, logout/re-login, payout SUPER_ADMIN, isolation partner, matriks origin).
- Web tests: **21/21** (4 files) — termasuk test baru: login `NAZHIR_VIEWER` diarahkan ke `/nazhir` hanya dengan satu `POST /auth/login`, dashboard Nazhir GET-saja tanpa kontrol tulis, gerbang role admin finance, dan 16 test regresi Batch 1–5 (public site, catalog, auth, portal mitra, order).
- Production build API + web: **PASS** (`tsc` + `vite build`, 1677 modules).
- `prisma migrate status` up to date (7 migrations), `prisma migrate diff` `No difference detected.`, seed dua kali idempotent (`7 users, 4 products`).
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Runtime smoke + **Real Runtime Acceptance Test: 64/64 PASS**.

## File yang berubah

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260922150000_batch6_finance/migration.sql`, `apps/api/prisma/seed.ts`
- `apps/api/src/services/finance.ts`, `apps/api/src/routes/finance.ts`
- `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/origin.ts` (baru, kebijakan origin/CORS/same-origin), `apps/api/src/routes/protected.ts`, `apps/api/src/routes/order.ts`, `apps/api/src/routes/partner.ts`
- `apps/api/tests/finance.test.ts`, `apps/api/tests/login.test.ts` (baru, regresi login per peran + matriks origin), `apps/api/vitest.config.ts`
- `apps/web/src/finance.tsx`, `apps/web/src/finance.css`, `apps/web/src/nazhir.tsx`, `apps/web/src/admin.tsx`, `apps/web/src/main.tsx`, `apps/web/src/order.tsx` (jalur `/api/checkout` dan `/api/orders/…`), `apps/web/vite.config.ts` (proxy `/public`, `/orders`), `apps/web/tests/finance.test.tsx`
- `README.md`, `BATCH_6_REPORT.md`
