# Dapuremakita Production Runbook

## Requirements

- Linux server with Node.js 24 LTS-compatible runtime, npm, PostgreSQL 16+, and Nginx/Caddy.
- HTTPS is mandatory for the public web origin because the auth cookie is Secure in production.
- Keep PostgreSQL private; do not expose port 5432 publicly.
- Store `.env` outside source control and restrict it to the service account.

## Environment

Required production values:

- `NODE_ENV=production`
- `DATABASE_URL` using a dedicated PostgreSQL user/password
- `JWT_SECRET` random and at least 32 characters
- `CORS_ORIGIN=https://your-web-domain.example`
- `PORT=3000`
- `UPLOAD_DIR=/srv/dapuremakita/uploads`
- `TRUST_PROXY=1` only when one trusted reverse proxy terminates HTTPS
- `VITE_API_URL=https://your-api-domain.example` when web/API use different origins

Never copy development database credentials or `Demo123!` into production.

## Deploy

1. Fetch the reviewed release commit.
2. Run `npm ci`.
3. Run `npm run prisma:generate`.
4. Run `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
5. Run `npm run lint && npm run typecheck && npm test && npm run build`.
6. Serve `apps/web/dist` as static files with SPA fallback to `index.html`.
7. Start API with `node apps/api/dist/src/server.js`.
8. Reverse-proxy API paths and enable HTTPS.
9. Verify `GET /health` returns 200 and `GET /health/ready` returns 200.
10. Run role/checkout/finance acceptance checks before shifting traffic.

Do not run the development seed in production; the seed process refuses `NODE_ENV=production`.

## Reverse proxy

Forward the real client address only from the trusted proxy. Set `TRUST_PROXY` to the exact proxy hop count, not an arbitrary high value. Preserve `X-Request-Id` when supplied; otherwise the API generates one.

## Backup

Run:

```bash
DATABASE_URL='...' BACKUP_DIR=/srv/backups/dapuremakita ./ops/backup.sh
```

The script uses PostgreSQL custom format and verifies the archive with `pg_restore --list`. Recommended retention: 7 daily, 4 weekly, and 6 monthly copies, with at least one encrypted off-host copy.

## Restore

Test restore regularly on a non-production database first.
```bash
DATABASE_URL='...' CONFIRM_RESTORE=RESTORE ./ops/restore.sh /srv/backups/dapuremakita/file.dump
```

Restore is destructive because it uses `--clean --if-exists`. Confirm the target database before running it.

## Recovery checklist

1. Stop application writes.
2. Identify the last known-good backup and verify it with `pg_restore --list`.
3. Snapshot the failed database if storage permits.
4. Restore into a fresh database when possible.
5. Run `prisma migrate deploy` if the backup predates current migrations.
6. Start the API and require readiness 200.
7. Validate authentication, catalogue, checkout, finance summary, partner isolation, and Nazhir read-only behavior.
8. Resume traffic and monitor structured logs.

## Rollback

Application rollback means deploying the previous reviewed commit and rebuilding it. Database migrations are forward-only: do not run `prisma migrate reset` or manually drop production data.

## Observability

Every HTTP response carries `X-Request-Id`. API logs are JSON lines and never include passwords, cookies, authorization tokens, or request bodies.

## Shutdown

SIGTERM/SIGINT stops new connections, disconnects Prisma, and exits after graceful server close. `SHUTDOWN_TIMEOUT_MS` defaults to 10 seconds.
