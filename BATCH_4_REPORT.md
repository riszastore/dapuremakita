# Batch 4: Admin dan Kurasi Produk

## Scope selesai

- Dashboard admin, daftar mitra, antrean submission, detail kurasi, notes, score, revisi, approve, reject, finalisasi, dan publish.
- Permission ketat: `CURATOR` dan `SUPER_ADMIN` untuk kurasi; `OPERATIONS` untuk status mitra; hanya `SUPER_ADMIN` untuk finalisasi dan publish.
- Score tujuh dimensi menghasilkan subtotal, persentase total, completion, dan threshold. Approve ditolak bila score belum lengkap atau threshold belum tercapai.
- Semua transisi tercatat pada revision, decision, dan audit log.
- Publish atomik membuat product ACTIVE, publication, dan status submission ACTIVE dalam satu transaksi. Repeated publish idempotent.
- Public catalog tetap ACTIVE-only.

## Migration safety

`IN_REVIEW` dimigrasikan ke `UNDER_REVIEW` pada kolom submission dan histori sebelum enum legacy dihapus. Default enum dilepas sementara saat perubahan tipe dan dipasang kembali setelahnya. `ProductStatus.REVIEW` juga dimigrasikan ke `UNDER_REVIEW` melalui migration forward-only.

Database lokal sudah memiliki schema Batch 4 tanpa reset atau penghapusan data. Metadata `_prisma_migrations` dibaseline secara non-destructive karena database awal tidak memiliki tabel metadata Prisma.

## Audit dan quality gates

- Audit pertama menemukan Prisma Client stale, route overview tertutup stub, scoring salah menjumlahkan key array, status workflow belum lengkap, dan migration enum gagal pada default legacy.
- Audit kedua memeriksa permission route, status legacy, ACTIVE-only catalog, atomic publish, nullable finalization, dan seed target database. Ditemukan dan diperbaiki bug finalize yang membuat product DRAFT sebelum publish serta path `.env` seed yang salah.
- `npx prisma validate`: pass.
- `npm run prisma:generate --workspace apps/api`: pass.
- `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`: pass, no pending migrations.
- `npx prisma migrate status`: pass, database schema up to date.
- `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel apps/api/prisma/schema.prisma`: pass, no difference detected.
- Seed dua kali: pass, masing-masing `7 users and 4 products`.
- Semua tests: pass, API `20/20` dan web `13/13`.
- Lint: pass.
- Production build: pass untuk API dan web. Vite memberi warning chunk >500 kB, bukan error.
- `npm audit --audit-level=high`: pass, `0 vulnerabilities`.

## Smoke test nyata

Dengan API berjalan di `http://localhost:3000`:

- `/health`: HTTP 200.
- `/public/products?limit=10`: HTTP 200, tiga produk aktif.
- Login super admin: HTTP 200.
- `/auth/me`: HTTP 200, role `SUPER_ADMIN`.
- `/api/admin/overview`: HTTP 200, tiga produk aktif dan dua mitra.

Tidak ada commit atau push yang dilakukan.