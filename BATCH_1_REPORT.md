# Batch 1 Report: Foundation + Auth + Role

## Scope

Batch ini membangun monorepo npm workspaces baru untuk Dapuremakita:

- `apps/api`: REST API Express + TypeScript.
- `apps/web`: React + Vite + TypeScript UI login responsif berbahasa Indonesia.
- PostgreSQL melalui Docker Compose dan Prisma schema.
- Auth login, logout, current session, JWT cookie HttpOnly, authentication middleware, dan RBAC.
- Seed satu user demo untuk setiap role.
- Test backend auth/RBAC dan frontend smoke test.
- Frontend session bootstrap melalui `/auth/me`, dev proxy, dan production API base URL.

## Structure

```text
apps/api/src/app.ts                 # Express app dan security middleware
apps/api/src/routes/auth.ts         # login, logout, me
apps/api/src/routes/protected.ts    # endpoint admin/partner/nazhir read-only
apps/api/src/middleware/auth.ts     # authenticate dan requireRoles
apps/api/src/middleware/errors.ts   # validation, safe error, 404
apps/api/src/services/auth.ts       # bcrypt compare dan JWT
apps/api/prisma/schema.prisma       # PostgreSQL User + Role enum
apps/api/prisma/seed.ts             # enam akun demo
apps/api/tests/auth.test.ts         # API behavior tests
apps/web/src/main.tsx               # login UI dan session state
apps/web/src/styles.css             # responsive visual system
apps/web/tests/smoke.test.tsx       # UI smoke test
apps/web/.env.example                # VITE_API_URL contract
```

## Endpoints

| Method | Path | Access | Behavior |
| --- | --- | --- | --- |
| GET | `/health` | public | health check |
| POST | `/auth/login` | public | validate credentials, set HttpOnly JWT cookie |
| POST | `/auth/logout` | public | clear auth cookie |
| GET | `/auth/me` | authenticated | return safe current user |
| GET | `/api/admin/overview` | `SUPER_ADMIN`, `CURATOR`, `OPERATIONS` | read-only admin overview |
| GET | `/api/partner/overview` | `PARTNER` | read-only partner overview |
| GET | `/api/nazhir/overview` | `NAZHIR_VIEWER` | read-only nazhir overview |

Auth failures intentionally return generic `Invalid email or password`; anonymous and invalid-token requests return generic `Authentication required`.

## Role matrix

| Role | Admin | Partner | Nazhir |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | allow | forbidden | forbidden |
| `CURATOR` | allow | forbidden | forbidden |
| `OPERATIONS` | allow | forbidden | forbidden |
| `PARTNER` | forbidden | allow | forbidden |
| `CUSTOMER` | forbidden | forbidden | forbidden |
| `NAZHIR_VIEWER` | forbidden | forbidden | allow |

Role names are exactly: `SUPER_ADMIN`, `CURATOR`, `OPERATIONS`, `PARTNER`, `CUSTOMER`, `NAZHIR_VIEWER`.

## Security

- Helmet headers, disabled Express fingerprinting, CORS origin from `CORS_ORIGIN`, credentials enabled.
- JSON body limit `32kb`.
- Login rate limit: 10 requests per minute per limiter window.
- Zod strict login schema with email and password bounds.
- bcrypt password hash cost 12 in seed, JWT expiry configurable through `JWT_EXPIRES_IN`.
- JWT is stored in an HttpOnly, SameSite=Lax cookie; Secure is enabled in production.
- JWT and cookie lifetime come from the same validated `JWT_EXPIRES_IN` duration.
- State-changing auth requests require matching `Origin` or `Referer` (same-origin CSRF baseline).
- Centralized error handler hides unexpected 500 details and logs server-side only.
- Malformed JSON returns 400 and oversized JSON returns 413.
- Password hashes never appear in the safe user response.

## Seed

Run `npm run seed --workspace @dapuremakita/api` after PostgreSQL migration. Seed refuses `NODE_ENV=production`. Every role has one user with the local-only password `Demo123!`:

`superadmin@dapuremakita.local`, `curator@dapuremakita.local`, `operations@dapuremakita.local`, `partner@dapuremakita.local`, `customer@dapuremakita.local`, `nazhir@dapuremakita.local`.

## Verification results

Final commands completed successfully:

- `npm install`: completed.
- `npm run prisma:generate`: Prisma Client 6.12.0 generated.
- `npm run lint`: passed for API and web.
- `npm test`: API 10 tests passed, web 5 tests passed.
- `npm run build`: API TypeScript and Vite production build passed.
- `npm audit --audit-level=high`: `found 0 vulnerabilities` after dependency repair.
- Prisma CLI and Client are pinned to the same `6.12.0` version and client was regenerated.

## Limitation and run guide

The automated API tests use a repository-in-memory so they do not require a running database. The production repository is Prisma-backed and requires PostgreSQL. Start it with `docker compose up -d postgres`, copy `.env.example` to `.env`, copy `apps/web/.env.example` to `apps/web/.env`, migrate, seed, then start the workspaces with `npm run dev`. Docker database credentials are development-only. No commit or push was performed; generated `node_modules` and build output remain ignored by git.