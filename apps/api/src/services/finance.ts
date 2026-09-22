import { FinanceAccrualStatus, OrderStatus, PaymentStatus, PayoutStatus, Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../middleware/errors.js';

export type FinanceDb = PrismaClient | Prisma.TransactionClient;
export type FinanceRange = { from?: string | undefined; to?: string | undefined };
export type PayoutCreateInput = {
  partnerId: string;
  accrualIds?: string[];
  note?: string;
  idempotencyKey: string;
  actorUserId: string;
};

export const FINANCE_SETTING_ID = 'default';
export const PRODUCER_SHARE_BPS_DEFAULT = 8000;
const BPS_DIVISOR = 10000;

/**
 * Model keuangan (semua integer rupiah, dihitung hanya oleh backend):
 *
 * ORDER -> ORDER ITEM -> OMZET -> HAK PRODUSEN -> MARGIN DAPUREMAKITA -> PAYOUT
 *
 * - Order sah secara finansial: paymentStatus SUCCEEDED dan status tidak CANCELLED.
 * - Omzet = totalRupiah order sah (subtotal produk + pengiriman).
 * - Hak produsen per item = pembulatan integer dari lineTotal * producerShareBps / 10000.
 * - Margin Dapuremakita = omzet - hak produsen kumulatif.
 * - Payout membayar hak produsen yang berstatus AVAILABLE, tidak pernah melebihi hak tersedia.
 */
export const isFinanciallyValidOrder = (order: { paymentStatus: PaymentStatus; status: OrderStatus }): boolean =>
  order.paymentStatus === PaymentStatus.SUCCEEDED && order.status !== OrderStatus.CANCELLED;

export const producerShareRupiah = (lineTotalRupiah: number, producerShareBps: number): number => {
  if (!Number.isInteger(lineTotalRupiah) || lineTotalRupiah < 0) throw new Error('Invalid line total');
  if (!Number.isInteger(producerShareBps) || producerShareBps < 0 || producerShareBps > BPS_DIVISOR) throw new Error('Invalid producer share');
  return Math.floor((lineTotalRupiah * producerShareBps + BPS_DIVISOR / 2) / BPS_DIVISOR);
};

export const platformMarginRupiah = (lineTotalRupiah: number, shareRupiah: number): number => lineTotalRupiah - shareRupiah;

const startOfDayUtc = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const nextDayUtc = (value: string): Date => { const date = startOfDayUtc(value); date.setUTCDate(date.getUTCDate() + 1); return date; };

const paidAtFilter = (range: FinanceRange): Prisma.DateTimeFilter | undefined => {
  const filter: Prisma.DateTimeFilter = {};
  if (range.from) filter.gte = startOfDayUtc(range.from);
  if (range.to) filter.lt = nextDayUtc(range.to);
  return Object.keys(filter).length ? filter : undefined;
};

export const eligibleOrderWhere = (range: FinanceRange = {}): Prisma.OrderWhereInput => {
  const where: Prisma.OrderWhereInput = { paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } };
  const paidAt = paidAtFilter(range);
  if (paidAt) where.paidAt = paidAt;
  return where;
};

export const payoutWhere = (range: FinanceRange = {}): Prisma.PayoutWhereInput => {
  const where: Prisma.PayoutWhereInput = {};
  const createdAt = paidAtFilter(range);
  if (createdAt) where.createdAt = createdAt;
  return where;
};

export const getProducerShareBps = async (db: FinanceDb): Promise<number> => {
  const existing = await db.financeSetting.findUnique({ where: { id: FINANCE_SETTING_ID } });
  if (existing) return existing.producerShareBps;
  try {
    const created = await db.financeSetting.create({ data: { id: FINANCE_SETTING_ID, producerShareBps: PRODUCER_SHARE_BPS_DEFAULT } });
    return created.producerShareBps;
  } catch {
    const reloaded = await db.financeSetting.findUnique({ where: { id: FINANCE_SETTING_ID } });
    if (!reloaded) throw new Error('Finance setting is unavailable');
    return reloaded.producerShareBps;
  }
};

const accrualData = (items: Array<{ id: string; orderId: string; partnerId: string | null; lineTotalRupiah: number }>, bps: number) =>
  items
    .filter((item) => item.partnerId !== null)
    .map((item) => ({
      orderItemId: item.id,
      orderId: item.orderId,
      partnerId: item.partnerId as string,
      amountRupiah: producerShareRupiah(item.lineTotalRupiah, bps),
      status: FinanceAccrualStatus.AVAILABLE,
    }));

/** Materialisasi hak produsen per order item; idempoten karena unique(orderItemId) + skipDuplicates. */
export const ensureAccrualsForOrder = async (db: FinanceDb, orderId: string): Promise<number> => {
  const where: Prisma.OrderItemWhereInput = {
    orderId,
    partnerId: { not: null },
    financeAccrual: null,
    order: { paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
  };
  const items = await db.orderItem.findMany({ where, select: { id: true, orderId: true, partnerId: true, lineTotalRupiah: true } });
  if (!items.length) return 0;
  const bps = await getProducerShareBps(db);
  const created = await db.financeAccrual.createMany({ data: accrualData(items, bps), skipDuplicates: true });
  return created.count;
};

export const ensureAccruals = async (db: FinanceDb): Promise<number> => {
  const where: Prisma.OrderItemWhereInput = {
    partnerId: { not: null },
    financeAccrual: null,
    order: { paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
  };
  const items = await db.orderItem.findMany({ where, select: { id: true, orderId: true, partnerId: true, lineTotalRupiah: true } });
  if (!items.length) return 0;
  const bps = await getProducerShareBps(db);
  const created = await db.financeAccrual.createMany({ data: accrualData(items, bps), skipDuplicates: true });
  return created.count;
};

export class FinanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async sync(): Promise<number> {
    return ensureAccruals(this.prisma);
  }

  async producerShareBps(): Promise<number> {
    return getProducerShareBps(this.prisma);
  }

  async summary(range: FinanceRange = {}) {
    await this.sync();
    const where = eligibleOrderWhere(range);
    const accrualWhere: Prisma.FinanceAccrualWhereInput = { order: where };
    const [subtotal, shipping, total, orderCount, itemStats, accrualByStatus, payoutByStatus, orderStatuses, productGroups, partnerGroups, bps] = await Promise.all([
      this.prisma.order.aggregate({ where, _sum: { subtotalRupiah: true } }),
      this.prisma.order.aggregate({ where, _sum: { shippingRupiah: true } }),
      this.prisma.order.aggregate({ where, _sum: { totalRupiah: true } }),
      this.prisma.order.count({ where }),
      this.prisma.orderItem.aggregate({ where: { order: where }, _sum: { quantity: true, lineTotalRupiah: true }, _count: { _all: true } }),
      this.prisma.financeAccrual.groupBy({ by: ['status'], where: accrualWhere, _sum: { amountRupiah: true }, _count: { _all: true } }),
      this.prisma.payout.groupBy({ by: ['status'], where: payoutWhere(range), _sum: { amountRupiah: true }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.orderItem.groupBy({ by: ['productSlugSnapshot'], where: { order: where }, _count: { _all: true } }),
      this.prisma.financeAccrual.groupBy({ by: ['partnerId'], where: accrualWhere, _sum: { amountRupiah: true } }),
      getProducerShareBps(this.prisma),
    ]);

    const sumOf = (rows: Array<{ status: string; _sum: { amountRupiah: number | null } }>, status: string) =>
      rows.find((row) => row.status === status)?._sum.amountRupiah ?? 0;
    const countOf = (rows: Array<{ status: string; _count: { _all: number } }>, status: string) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;

    const omzetProduct = subtotal._sum.subtotalRupiah ?? 0;
    const omzetShipping = shipping._sum.shippingRupiah ?? 0;
    const omzetTotal = total._sum.totalRupiah ?? 0;
    const hakAccrued = accrualByStatus.reduce((sum, row) => sum + (row._sum.amountRupiah ?? 0), 0);
    const hakAvailable = sumOf(accrualByStatus, FinanceAccrualStatus.AVAILABLE);
    const hakReserved = sumOf(accrualByStatus, FinanceAccrualStatus.RESERVED);
    const hakPaid = sumOf(accrualByStatus, FinanceAccrualStatus.PAID);
    const marginTotal = platformMarginRupiah(omzetTotal, hakAccrued);

    return {
      range,
      producerShareBps: bps,
      omzet: {
        productRupiah: omzetProduct,
        shippingRupiah: omzetShipping,
        totalRupiah: omzetTotal,
        orderCount,
        itemCount: itemStats._count._all,
        quantitySold: itemStats._sum.quantity ?? 0,
      },
      hakProdusen: {
        accruedRupiah: hakAccrued,
        availableRupiah: hakAvailable,
        reservedRupiah: hakReserved,
        paidRupiah: hakPaid,
        pendingRupiah: hakAccrued - hakPaid,
        partnerCount: partnerGroups.length,
        accrualCount: accrualByStatus.reduce((sum, row) => sum + row._count._all, 0),
      },
      margin: {
        totalRupiah: marginTotal,
        productRupiah: platformMarginRupiah(omzetProduct, hakAccrued),
        shippingRupiah: omzetShipping,
      },
      payout: {
        pendingAmountRupiah: sumOf(payoutByStatus, PayoutStatus.PENDING),
        completedAmountRupiah: sumOf(payoutByStatus, PayoutStatus.COMPLETED),
        cancelledAmountRupiah: sumOf(payoutByStatus, PayoutStatus.CANCELLED),
        pendingCount: countOf(payoutByStatus, PayoutStatus.PENDING),
        completedCount: countOf(payoutByStatus, PayoutStatus.COMPLETED),
        cancelledCount: countOf(payoutByStatus, PayoutStatus.CANCELLED),
      },
      breakdown: {
        ordersByStatus: orderStatuses.map((row) => ({ status: row.status, count: row._count._all })),
        distinctProducts: productGroups.length,
      },
      checks: {
        identityHold: omzetTotal === omzetProduct + omzetShipping && marginTotal === omzetTotal - hakAccrued,
        marginNonNegative: marginTotal >= 0,
        payoutWithinHak: sumOf(payoutByStatus, PayoutStatus.COMPLETED) <= hakAccrued,
      },
    };
  }

  async transactions(range: FinanceRange, page: number, limit: number, type?: 'ORDER' | 'PAYOUT') {
    await this.sync();
    const where = eligibleOrderWhere(range);
    const payoutQuery = payoutWhere(range);
    const take = page * limit;
    const [orders, payouts, orderTotal, payoutTotal] = await Promise.all([
      type === 'PAYOUT' ? Promise.resolve([]) : this.prisma.order.findMany({ where, orderBy: { paidAt: 'desc' }, take, select: { id: true, orderNumber: true, status: true, paymentStatus: true, customerName: true, totalRupiah: true, paidAt: true, createdAt: true, _count: { select: { items: true } } } }),
      type === 'ORDER' ? Promise.resolve([]) : this.prisma.payout.findMany({ where: payoutQuery, orderBy: { createdAt: 'desc' }, take, select: { id: true, reference: true, status: true, amountRupiah: true, createdAt: true, partner: { select: { name: true, slug: true } } } }),
      type === 'PAYOUT' ? Promise.resolve(0) : this.prisma.order.count({ where }),
      type === 'ORDER' ? Promise.resolve(0) : this.prisma.payout.count({ where: payoutQuery }),
    ]);

    type Row = { kind: 'ORDER' | 'PAYOUT'; id: string; reference: string; date: string; party: string; amountRupiah: number; status: string };
    const rows: Row[] = [
      ...orders.map((order) => ({
        kind: 'ORDER' as const,
        id: order.id,
        reference: order.orderNumber,
        date: (order.paidAt ?? order.createdAt).toISOString(),
        party: order.customerName,
        amountRupiah: order.totalRupiah,
        status: order.status,
      })),
      ...payouts.map((payout) => ({
        kind: 'PAYOUT' as const,
        id: payout.id,
        reference: payout.reference,
        date: payout.createdAt.toISOString(),
        party: payout.partner.name,
        amountRupiah: payout.amountRupiah,
        status: payout.status,
      })),
    ];
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const total = orderTotal + payoutTotal;
    return {
      items: rows.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async accruals(query: { page: number; limit: number; partnerId?: string; status?: FinanceAccrualStatus }) {
    await this.sync();
    const where: Prisma.FinanceAccrualWhereInput = {
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total, sums] = await Promise.all([
      this.prisma.financeAccrual.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          amountRupiah: true,
          status: true,
          createdAt: true,
          partner: { select: { id: true, name: true, slug: true } },
          order: { select: { id: true, orderNumber: true, paidAt: true } },
          orderItem: { select: { id: true, productNameSnapshot: true, productSlugSnapshot: true, quantity: true, lineTotalRupiah: true } },
        },
      }),
      this.prisma.financeAccrual.count({ where }),
      this.prisma.financeAccrual.groupBy({ by: ['status'], where, _sum: { amountRupiah: true }, _count: { _all: true } }),
    ]);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      totals: sums.map((row) => ({ status: row.status, count: row._count._all, amountRupiah: row._sum.amountRupiah ?? 0 })),
    };
  }

  async listPayouts(query: { page: number; limit: number; partnerId?: string; status?: PayoutStatus }) {
    await this.sync();
    const where: Prisma.PayoutWhereInput = {
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: payoutSelect(true),
      }),
      this.prisma.payout.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  async getPayout(id: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id }, select: payoutSelect(true) });
    if (!payout) throw new HttpError(404, 'Payout not found');
    return payout;
  }

  async createPayout(input: PayoutCreateInput) {
    const existing = await this.prisma.payout.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: payoutSelect(true) });
    if (existing) return { payout: existing, idempotent: true };
    const partner = await this.prisma.partner.findUnique({ where: { id: input.partnerId } });
    if (!partner) throw new HttpError(404, 'Partner not found');
    await this.sync();

    const payout = await this.prisma.$transaction(async (tx) => {
      const explicit = input.accrualIds && input.accrualIds.length > 0;
      const locked = explicit
        ? await tx.$queryRaw<Array<{ id: string; amountRupiah: number; partnerId: string; status: string }>>`
            SELECT "id", "amountRupiah", "partnerId", "status"::text AS "status"
            FROM "FinanceAccrual"
            WHERE "id" IN (${Prisma.join(input.accrualIds as string[])})
            ORDER BY "id"
            FOR UPDATE`
        : await tx.$queryRaw<Array<{ id: string; amountRupiah: number; partnerId: string; status: string }>>`
            SELECT "id", "amountRupiah", "partnerId", "status"::text AS "status"
            FROM "FinanceAccrual"
            WHERE "partnerId" = ${input.partnerId} AND "status" = 'AVAILABLE'
            ORDER BY "createdAt", "id"
            FOR UPDATE`;

      if (explicit) {
        if (locked.length !== new Set(input.accrualIds).size) throw new HttpError(404, 'Producer share not found');
        if (locked.some((row) => row.partnerId !== input.partnerId)) throw new HttpError(404, 'Producer share not found');
        if (locked.some((row) => row.status !== FinanceAccrualStatus.AVAILABLE)) throw new HttpError(409, 'Producer share is already reserved or paid');
      } else if (!locked.length) {
        throw new HttpError(409, 'No available producer share for this partner');
      }

      const amountRupiah = locked.reduce((sum, row) => sum + row.amountRupiah, 0);
      const accrualIds = locked.map((row) => row.id);
      const created = await createPayoutRow(tx, {
        partnerId: input.partnerId,
        amountRupiah,
        idempotencyKey: input.idempotencyKey,
        note: input.note ?? null,
        createdByUserId: input.actorUserId,
      });
      const reserved = await tx.financeAccrual.updateMany({
        where: { id: { in: accrualIds }, status: FinanceAccrualStatus.AVAILABLE, partnerId: input.partnerId },
        data: { status: FinanceAccrualStatus.RESERVED, payoutId: created.id },
      });
      if (reserved.count !== accrualIds.length) throw new HttpError(409, 'Producer share is already reserved or paid');
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          entityType: 'Payout',
          entityId: created.id,
          action: 'PAYOUT_CREATED',
          details: JSON.stringify({ partnerId: input.partnerId, amountRupiah, accruals: accrualIds.length }),
        },
      });
      return created;
    });

    return { payout: await this.getPayout(payout.id), idempotent: false };
  }

  async completePayout(id: string, actorUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT "id", "status"::text AS "status" FROM "Payout" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new HttpError(404, 'Payout not found');
      if (rows[0].status !== PayoutStatus.PENDING) throw new HttpError(409, 'Payout is not pending');
      const paid = await tx.financeAccrual.updateMany({
        where: { payoutId: id, status: FinanceAccrualStatus.RESERVED },
        data: { status: FinanceAccrualStatus.PAID },
      });
      if (!paid.count) throw new HttpError(409, 'Payout has no reserved producer share');
      await tx.payout.update({ where: { id }, data: { status: PayoutStatus.COMPLETED, completedAt: new Date() } });
      await tx.auditLog.create({ data: { actorUserId, entityType: 'Payout', entityId: id, action: 'PAYOUT_COMPLETED', details: JSON.stringify({ accruals: paid.count }) } });
    });
    return this.getPayout(id);
  }

  async cancelPayout(id: string, actorUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT "id", "status"::text AS "status" FROM "Payout" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new HttpError(404, 'Payout not found');
      if (rows[0].status !== PayoutStatus.PENDING) throw new HttpError(409, 'Payout is not pending');
      const released = await tx.financeAccrual.updateMany({
        where: { payoutId: id, status: FinanceAccrualStatus.RESERVED },
        data: { status: FinanceAccrualStatus.AVAILABLE, payoutId: null },
      });
      await tx.payout.update({ where: { id }, data: { status: PayoutStatus.CANCELLED, cancelledAt: new Date() } });
      await tx.auditLog.create({ data: { actorUserId, entityType: 'Payout', entityId: id, action: 'PAYOUT_CANCELLED', details: JSON.stringify({ accruals: released.count }) } });
    });
    return this.getPayout(id);
  }

  async reportProducts(range: FinanceRange, limit: number) {
    await this.sync();
    const where = eligibleOrderWhere(range);
    const items = await this.prisma.orderItem.findMany({
      where: { order: where },
      select: {
        productSlugSnapshot: true,
        productNameSnapshot: true,
        quantity: true,
        lineTotalRupiah: true,
        partner: { select: { name: true, slug: true } },
        financeAccrual: { select: { amountRupiah: true } },
        product: { select: { status: true, publication: { select: { submission: { select: { hppRupiah: true } } } } } },
      },
    });
    type Bucket = { slug: string; name: string; quantity: number; itemCount: number; omzetRupiah: number; hakProdusenRupiah: number; hppTotalRupiah: number; hppKnown: boolean; partner: { name: string; slug: string } | null; status: string | null };
    const buckets = new Map<string, Bucket>();
    for (const item of items) {
      const key = item.productSlugSnapshot;
      const hpp = item.product?.publication?.submission?.hppRupiah ?? null;
      const bucket = buckets.get(key) ?? {
        slug: key,
        name: item.productNameSnapshot,
        quantity: 0,
        itemCount: 0,
        omzetRupiah: 0,
        hakProdusenRupiah: 0,
        hppTotalRupiah: 0,
        hppKnown: true,
        partner: item.partner,
        status: item.product?.status ?? null,
      };
      bucket.quantity += item.quantity;
      bucket.itemCount += 1;
      bucket.omzetRupiah += item.lineTotalRupiah;
      bucket.hakProdusenRupiah += item.financeAccrual?.amountRupiah ?? 0;
      if (hpp === null) bucket.hppKnown = false;
      else bucket.hppTotalRupiah += hpp * item.quantity;
      buckets.set(key, bucket);
    }
    const rows = [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        marginRupiah: platformMarginRupiah(bucket.omzetRupiah, bucket.hakProdusenRupiah),
        producerSurplusRupiah: bucket.hppKnown ? bucket.hakProdusenRupiah - bucket.hppTotalRupiah : null,
      }))
      .sort((a, b) => b.omzetRupiah - a.omzetRupiah);
    return { range, items: rows.slice(0, limit), total: rows.length };
  }

  async reportPartners(range: FinanceRange, limit: number) {
    await this.sync();
    const where = eligibleOrderWhere(range);
    const [partners, accruals, payouts, itemGroups] = await Promise.all([
      this.prisma.partner.findMany({ select: { id: true, name: true, slug: true, status: true, user: { select: { email: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.financeAccrual.findMany({
        where: { order: where },
        select: { partnerId: true, amountRupiah: true, status: true, orderItem: { select: { lineTotalRupiah: true, quantity: true } } },
      }),
      this.prisma.payout.groupBy({ by: ['partnerId', 'status'], where: payoutWhere(range), _sum: { amountRupiah: true }, _count: { _all: true } }),
      this.prisma.orderItem.groupBy({ by: ['partnerId'], where: { order: where, partnerId: { not: null } }, _count: { _all: true }, _sum: { lineTotalRupiah: true, quantity: true } }),
    ]);

    const rows = partners.map((partner) => {
      const ownAccruals = accruals.filter((row) => row.partnerId === partner.id);
      const ownItems = itemGroups.find((row) => row.partnerId === partner.id);
      const ownPayouts = payouts.filter((row) => row.partnerId === partner.id);
      const accrued = ownAccruals.reduce((sum, row) => sum + row.amountRupiah, 0);
      const available = ownAccruals.filter((row) => row.status === FinanceAccrualStatus.AVAILABLE).reduce((sum, row) => sum + row.amountRupiah, 0);
      const reserved = ownAccruals.filter((row) => row.status === FinanceAccrualStatus.RESERVED).reduce((sum, row) => sum + row.amountRupiah, 0);
      const paid = ownAccruals.filter((row) => row.status === FinanceAccrualStatus.PAID).reduce((sum, row) => sum + row.amountRupiah, 0);
      const omzetRupiah = ownItems?._sum.lineTotalRupiah ?? 0;
      const completed = ownPayouts.find((row) => row.status === PayoutStatus.COMPLETED);
      const pending = ownPayouts.find((row) => row.status === PayoutStatus.PENDING);
      return {
        partner: { id: partner.id, name: partner.name, slug: partner.slug, status: partner.status, email: partner.user?.email ?? null },
        itemCount: ownItems?._count._all ?? 0,
        quantitySold: ownItems?._sum.quantity ?? 0,
        omzetRupiah,
        hakProdusenRupiah: accrued,
        hakAvailableRupiah: available,
        hakReservedRupiah: reserved,
        hakPaidRupiah: paid,
        marginRupiah: platformMarginRupiah(omzetRupiah, accrued),
        payoutCompletedCount: completed?._count._all ?? 0,
        payoutCompletedRupiah: completed?._sum.amountRupiah ?? 0,
        payoutPendingRupiah: pending?._sum.amountRupiah ?? 0,
      };
    });
    const sorted = rows.sort((a, b) => b.hakProdusenRupiah - a.hakProdusenRupiah || b.omzetRupiah - a.omzetRupiah);
    return { range, items: sorted.slice(0, limit), total: sorted.length };
  }

  async reportImpact(range: FinanceRange) {
    const summary = await this.summary(range);
    const where = eligibleOrderWhere(range);
    const [productionStatuses, provinces, accrualPartners, paidPartners, activeProducts, categories] = await Promise.all([
      this.prisma.orderItem.groupBy({ by: ['productionStatus'], where: { order: where }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['shippingProvince'], where, _count: { _all: true }, _sum: { totalRupiah: true }, orderBy: { _sum: { totalRupiah: 'desc' } }, take: 10 }),
      this.prisma.financeAccrual.groupBy({ by: ['partnerId'], where: { order: where }, _count: { _all: true } }),
      this.prisma.financeAccrual.groupBy({ by: ['partnerId'], where: { order: where, status: FinanceAccrualStatus.PAID }, _count: { _all: true } }),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.category.count(),
    ]);
    return {
      range,
      totals: {
        omzetRupiah: summary.omzet.totalRupiah,
        hakProdusenRupiah: summary.hakProdusen.accruedRupiah,
        marginRupiah: summary.margin.totalRupiah,
        payoutPaidRupiah: summary.payout.completedAmountRupiah,
        payoutPendingRupiah: summary.payout.pendingAmountRupiah,
      },
      reach: {
        orderCount: summary.omzet.orderCount,
        orderItemCount: summary.omzet.itemCount,
        quantitySold: summary.omzet.quantitySold,
        distinctProducts: summary.breakdown.distinctProducts,
        partnersWithHak: accrualPartners.length,
        partnersPaid: paidPartners.length,
        activeProducts,
        categories,
      },
      fulfilment: {
        ordersByStatus: summary.breakdown.ordersByStatus,
        itemsByProductionStatus: productionStatuses.map((row) => ({ status: row.productionStatus, count: row._count._all })),
      },
      provinces: provinces.map((row) => ({ province: row.shippingProvince, orderCount: row._count._all, omzetRupiah: row._sum.totalRupiah ?? 0 })),
      checks: summary.checks,
    };
  }

  async partnerFinance(partnerId: string, range: FinanceRange = {}) {
    await this.sync();
    const where = eligibleOrderWhere(range);
    const payoutScope = payoutWhere(range);
    const partnerPayoutWhere: Prisma.PayoutWhereInput = { partnerId, ...(payoutScope.createdAt ? { createdAt: payoutScope.createdAt } : {}) };
    const [accruals, payouts, items, payoutSums] = await Promise.all([
      this.prisma.financeAccrual.groupBy({ by: ['status'], where: { partnerId, order: where }, _sum: { amountRupiah: true }, _count: { _all: true } }),
      this.prisma.payout.findMany({ where: partnerPayoutWhere, orderBy: { createdAt: 'desc' }, take: 20, select: payoutSelect(false) }),
      this.prisma.orderItem.aggregate({ where: { partnerId, order: where }, _count: { _all: true }, _sum: { lineTotalRupiah: true, quantity: true } }),
      this.prisma.payout.groupBy({ by: ['status'], where: partnerPayoutWhere, _sum: { amountRupiah: true }, _count: { _all: true } }),
    ]);
    const sumOf = (rows: Array<{ status: string; _sum: { amountRupiah: number | null } }>, status: string) => rows.find((row) => row.status === status)?._sum.amountRupiah ?? 0;
    const countOf = (rows: Array<{ status: string; _count: { _all: number } }>, status: string) => rows.find((row) => row.status === status)?._count._all ?? 0;
    const accrued = accruals.reduce((sum, row) => sum + (row._sum.amountRupiah ?? 0), 0);
    const omzetRupiah = items._sum.lineTotalRupiah ?? 0;
    return {
      range,
      omzetKontribusiRupiah: omzetRupiah,
      quantitySold: items._sum.quantity ?? 0,
      itemCount: items._count._all,
      hakProdusen: {
        accruedRupiah: accrued,
        availableRupiah: sumOf(accruals, FinanceAccrualStatus.AVAILABLE),
        reservedRupiah: sumOf(accruals, FinanceAccrualStatus.RESERVED),
        paidRupiah: sumOf(accruals, FinanceAccrualStatus.PAID),
        accrualCount: accruals.reduce((sum, row) => sum + row._count._all, 0),
      },
      marginKontribusiRupiah: platformMarginRupiah(omzetRupiah, accrued),
      payout: {
        pendingAmountRupiah: sumOf(payoutSums, PayoutStatus.PENDING),
        completedAmountRupiah: sumOf(payoutSums, PayoutStatus.COMPLETED),
        completedCount: countOf(payoutSums, PayoutStatus.COMPLETED),
        items: payouts,
      },
    };
  }
}

const payoutSelect = (withAccruals: boolean) =>
  ({
    id: true,
    reference: true,
    partnerId: true,
    amountRupiah: true,
    status: true,
    note: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
    cancelledAt: true,
    partner: { select: { id: true, name: true, slug: true } },
    creator: { select: { id: true, name: true, role: true } },
    ...(withAccruals
      ? {
          accruals: {
            select: {
              id: true,
              amountRupiah: true,
              status: true,
              orderItem: { select: { productNameSnapshot: true, productSlugSnapshot: true, quantity: true, lineTotalRupiah: true } },
              order: { select: { id: true, orderNumber: true, paidAt: true } },
            },
            orderBy: { createdAt: 'asc' as const },
          },
        }
      : {}),
  }) as Prisma.PayoutSelect;

const referenceFor = () => {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PO-${stamp}-${suffix}`;
};

const createPayoutRow = async (
  tx: Prisma.TransactionClient,
  data: { partnerId: string; amountRupiah: number; idempotencyKey: string; note: string | null; createdByUserId: string },
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await tx.payout.create({
        data: {
          reference: referenceFor(),
          idempotencyKey: data.idempotencyKey,
          partnerId: data.partnerId,
          amountRupiah: data.amountRupiah,
          note: data.note,
          createdByUserId: data.createdByUserId,
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'P2002' || attempt === 2) throw error;
    }
  }
  throw new Error('Unable to create payout reference');
};
