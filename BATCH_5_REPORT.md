# Batch 5: Order dan Checkout

## Arsitektur

- `Order`, `OrderItem`, dan `OrderStatusHistory` ditambahkan ke Prisma dengan integer rupiah, order number unik, idempotency key unik, payment state, timestamps, item assignment, dan immutable product/price snapshots.
- `POST /checkout` membaca ulang semua produk dalam satu transaksi, hanya menerima `ACTIVE`, menghitung subtotal/total dari database, lalu membuat order dan initial history entry.
- Mock payment memiliki outcome sukses/gagal dan tidak dapat mengubah order yang payment state-nya sudah final.
- Admin `SUPER_ADMIN` dan `OPERATIONS` dapat list/filter by status, detail, assign partner per item, dan menjalankan transition matrix fulfillment.
- Partner hanya query item dengan `partnerId` tenant sendiri dan tidak menerima alamat lengkap, email, telepon, atau nilai order customer.
- Web menambahkan cart durable, checkout tamu, payment result, order status, admin order list, dan partner assigned-order list dalam router React yang sudah ada.

## Endpoint dan invariants

`POST /checkout`, `POST /orders/:id/payment`, dan `GET /orders/:orderNumber` adalah public guest flow. Checkout menolak product hilang/inactive, mengabaikan harga/totals client, dan mengembalikan order yang sama untuk idempotency key yang sama. Admin routes hanya `SUPER_ADMIN`/`OPERATIONS`; public tidak dapat membaca admin/partner data. Partner cross-tenant read/write menghasilkan 404.

Valid fulfillment transitions:

`PENDING_PAYMENT -> PAID|CANCELLED -> PROCESSING -> PRODUCTION -> QC -> READY -> SHIPPED -> DELIVERED`.

Valid production transitions:

`UNASSIGNED -> ASSIGNED -> IN_PRODUCTION -> QC -> READY`.

Invalid transitions produce HTTP 409. Status history is append-only through the API.

## Migration safety

Migration `20260922130000_batch5_orders_checkout` creates only new enums/tables/indexes/foreign keys. It was deployed forward-only to the existing PostgreSQL database; no reset or delete operation was used. Prisma status reports the database up to date. The seed remains idempotent and was run twice successfully.

## Tests and gates

- API tests: `24/24` including price tampering, ACTIVE-only checkout, payment idempotency, transition validation, admin authorization, assignment validation, partner isolation.
- Web tests: `16/16` including cart persistence/math and existing public/auth routes.
- API and web lint: pass.
- API and web production builds: pass.
- Prisma validate/generate/migrate deploy/status: pass.
- Prisma migration diff: pass; live datasource versus datamodel produced an empty migration.
- Seed twice: pass, `7 users and 4 products` each run.
- `npm audit --audit-level=high`: recorded in final gate output; no secrets are included here.

## Smoke flow

The final smoke flow covers health, active catalogue, guest checkout, mock payment, admin login/list, admin item assignment, partner visibility, partner status update, and public order status. It runs against local PostgreSQL and the local API server; generated order data is non-production demo data.