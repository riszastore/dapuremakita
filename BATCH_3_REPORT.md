# Batch 3 Report: Portal Mitra

## Scope

Batch 3 adds the authenticated partner portal while preserving Batch 1 cookie auth/RBAC and Batch 2 ACTIVE-only public catalog behavior.

- Prisma domain: unique `User` to `Partner`, `PartnerProfile`, legal document metadata, product submissions, initial photos, integer-positive HPP/capacity, revision history and timestamps.
- API: `/api/partner` is authenticated and `PARTNER`-only. Partner identity is derived from the verified session user and every resource query is owner-scoped. Foreign resources return 404.
- Uploads: PDF/JPEG/PNG allowlist, 8 MiB multipart limit, extension and magic-byte checks, randomized object keys, path-safe local storage under ignored `var/uploads`, and no blobs/base64 in PostgreSQL.
- UI: responsive portal dashboard, profile, legalitas, submission list/new/detail/edit routes, role/session guard, loading/error/empty/success states, currency/capacity controls, status badge and revision timeline.

## Verification

- `npm run prisma:generate`
- `npx prisma validate --schema apps/api/prisma/schema.prisma`
- `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`
- Seed executed twice successfully; two deterministic PARTNER accounts are linked to different partners.
- `npm run lint`: pass
- `npm test`: API 20 tests and web 13 tests pass
- `npm run build`: API and Vite production build pass
- `npm audit --audit-level=high`: 0 vulnerabilities
- Real cookie smoke: two partner logins, owner 200, cross-tenant detail 404, customer 403, draft creation/update, incomplete submit 400, PNG photo upload 201, legal upload 201, complete submit 200.

## Security and tenant audit

First audit found upload target directories and temp cleanup edge cases; both were repaired. The independent second audit added magic-byte validation, category normalization on update, strict revision note handling, and actor-backed revision history. Tests cover anonymous/non-partner access, two-tenant isolation, invalid IDs, strict mass assignment, HPP/capacity bounds, MIME/filename/path traversal, completeness, immutable submitted state, public compatibility, portal guards, profile, document and submission DOM routes.

No Critical, High, or Medium findings remain. Development credentials and local object storage remain development-only; `.env`, generated output, dependencies, build metadata, and uploaded files are ignored.
