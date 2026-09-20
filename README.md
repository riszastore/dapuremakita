# Dapuremakita

Platform kurasi, pemasaran, dan pengelolaan produk UMKM terpilih. Batch 1 menyediakan foundation monorepo, autentikasi cookie HttpOnly, dan akses berbasis role.

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

Kredensial PostgreSQL di `docker-compose.yml` (`dapuremakita` / `dapuremakita`) hanya untuk development lokal. Untuk deployment, gunakan secret manager, password unik, database private, dan `VITE_API_URL` yang menunjuk ke API HTTPS. `VITE_API_URL` kosong memakai proxy Vite development.

## Workspace

- `apps/api`: Express 5, TypeScript, Prisma PostgreSQL, Zod, bcrypt, JWT, cookie HttpOnly.
- `apps/web`: React 19 + Vite + TypeScript, UI login responsif berbahasa Indonesia.
- `docker-compose.yml`: PostgreSQL 16 lokal.

## Commands

`npm run lint`, `npm test`, `npm run build`, `npm run prisma:generate`, dan `npm audit --audit-level=high` menjalankan pemeriksaan utama. Detail scope, endpoint, role matrix, security, dan limitation ada di [BATCH_1_REPORT.md](BATCH_1_REPORT.md).

Smoke API setelah database aktif: `curl http://localhost:3000/health`, login dengan cookie jar (`curl -c /tmp/dm.cookies -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' -d '{"email":"partner@dapuremakita.local","password":"Demo123!"}' http://localhost:3000/auth/login`), lalu panggil `/auth/me` dan endpoint role dengan `-b /tmp/dm.cookies`. Logout memakai `POST /auth/logout` dan header `Origin` yang sama.
