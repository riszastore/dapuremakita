import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { OrderStatus, PaymentStatus, PrismaClient, ProductionStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import { authenticate, requireRoles, requireSameOrigin } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { ensureAccrualsForOrder } from '../services/finance.js';

const idSchema = z.string().regex(/^[a-z0-9]{20,}$/i);
const orderNumberSchema = z.string().regex(/^DM-\d{8}-[A-Z0-9]{6}$/);
const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(100),
  customer: z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(160), phone: z.string().trim().min(8).max(30) }).strict(),
  shipping: z.object({ address: z.string().trim().min(5).max(240), city: z.string().trim().min(2).max(80), province: z.string().trim().min(2).max(80), postalCode: z.string().regex(/^\d{5}$/) }).strict(),
  items: z.array(z.object({ productId: z.string().min(10), quantity: z.number().int().min(1).max(100), price: z.number().optional(), total: z.number().optional() }).strict()).min(1).max(50),
  subtotal: z.number().optional(),
  total: z.number().optional(),
}).strict();
const paymentSchema = z.object({ idempotencyKey: z.string().trim().min(16).max(100), outcome: z.enum(['success', 'failure']).default('success') }).strict();
const sensitiveMutationLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [OrderStatus.PAID, OrderStatus.CANCELLED], PAID: [OrderStatus.PROCESSING, OrderStatus.CANCELLED], PROCESSING: [OrderStatus.PRODUCTION, OrderStatus.CANCELLED],
  PRODUCTION: [OrderStatus.QC, OrderStatus.CANCELLED], QC: [OrderStatus.READY, OrderStatus.PRODUCTION, OrderStatus.CANCELLED], READY: [OrderStatus.SHIPPED, OrderStatus.CANCELLED], SHIPPED: [OrderStatus.DELIVERED], DELIVERED: [], CANCELLED: [],
};
const productionTransitions: Record<ProductionStatus, ProductionStatus[]> = { UNASSIGNED: [ProductionStatus.ASSIGNED], ASSIGNED: [ProductionStatus.IN_PRODUCTION], IN_PRODUCTION: [ProductionStatus.QC], QC: [ProductionStatus.READY], READY: [] };
const orderSelect = { id: true, orderNumber: true, status: true, paymentStatus: true, customerName: true, customerEmail: true, customerPhone: true, shippingAddress: true, shippingCity: true, shippingProvince: true, shippingPostalCode: true, subtotalRupiah: true, shippingRupiah: true, totalRupiah: true, paymentReference: true, paidAt: true, createdAt: true, updatedAt: true, items: { select: { id: true, productId: true, productNameSnapshot: true, productSlugSnapshot: true, unitPriceRupiah: true, quantity: true, lineTotalRupiah: true, partnerId: true, productionStatus: true, partner: { select: { id: true, name: true, slug: true } } } }, statusHistory: { orderBy: { createdAt: 'asc' as const }, select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true, role: true } } } } };
const makeOrderNumber = () => `DM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const orderRouter = (prisma: PrismaClient, auth: AuthService) => {
  const router = Router();

  /**
   * Route tamu (checkout, pembayaran mock, status order) dipasang dua kali: path akar yang
   * lama dan alias `/api` supaya tetap terjangkau lewat proxy Vite development yang hanya
   * meneruskan `/api`, `/auth`, `/public`, `/orders`, dan `/health`.
   */
  const guestRouter = Router();
  guestRouter.post('/checkout', sensitiveMutationLimiter, requireSameOrigin, async (req, res, next) => {
    try {
      const values = checkoutSchema.parse(req.body);
      const order = await prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({ where: { idempotencyKey: values.idempotencyKey }, include: { items: true } });
        if (existing) return existing;
        const productIds = values.items.map((item) => item.productId);
        const products = await tx.product.findMany({ where: { id: { in: productIds }, status: 'ACTIVE' }, select: { id: true, name: true, slug: true, price: true, partnerId: true } });
        if (products.length !== new Set(productIds).size) throw new HttpError(409, 'One or more products are no longer available');
        const productMap = new Map(products.map((product) => [product.id, product]));
        const items = values.items.map((item) => { const product = productMap.get(item.productId)!; return { productId: product.id, productNameSnapshot: product.name, productSlugSnapshot: product.slug, unitPriceRupiah: product.price, quantity: item.quantity, lineTotalRupiah: product.price * item.quantity, partnerId: product.partnerId, productionStatus: product.partnerId ? ProductionStatus.ASSIGNED : ProductionStatus.UNASSIGNED }; });
        const subtotalRupiah = items.reduce((sum, item) => sum + item.lineTotalRupiah, 0);
        const created = await tx.order.create({ data: { orderNumber: makeOrderNumber(), idempotencyKey: values.idempotencyKey, customerName: values.customer.name, customerEmail: values.customer.email, customerPhone: values.customer.phone, shippingAddress: values.shipping.address, shippingCity: values.shipping.city, shippingProvince: values.shipping.province, shippingPostalCode: values.shipping.postalCode, subtotalRupiah, shippingRupiah: 0, totalRupiah: subtotalRupiah, items: { create: items } } });
        await tx.orderStatusHistory.create({ data: { orderId: created.id, toStatus: OrderStatus.PENDING_PAYMENT, note: 'Order dibuat' } });
        return created;
      });
      res.status(201).json({ order });
    } catch (error) { next(error); }
  });
  guestRouter.post('/orders/:id/payment', sensitiveMutationLimiter, requireSameOrigin, async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id); const values = paymentSchema.parse(req.body);
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id } }); if (!order) throw new HttpError(404, 'Order not found');
        if (order.paymentStatus !== PaymentStatus.PENDING) return order;
        if (values.outcome === 'failure') return tx.order.update({ where: { id }, data: { paymentStatus: PaymentStatus.FAILED } });
        const updated = await tx.order.update({ where: { id }, data: { paymentStatus: PaymentStatus.SUCCEEDED, status: OrderStatus.PAID, paymentReference: `MOCK-${values.idempotencyKey}`, paidAt: new Date() } });
        await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: OrderStatus.PAID, note: 'Pembayaran mock berhasil' } });
        await ensureAccrualsForOrder(tx, id);
        return updated;
      });
      res.json({ order: result });
    } catch (error) { next(error); }
  });
  guestRouter.get('/orders/:orderNumber', async (req, res, next) => { try { const number = orderNumberSchema.parse(req.params.orderNumber); const order = await prisma.order.findUnique({ where: { orderNumber: number }, select: orderSelect }); if (!order) throw new HttpError(404, 'Order not found'); res.json({ order }); } catch (error) { next(error); } });

  router.use(guestRouter);
  router.use('/api', guestRouter);

  const protectedRouter = Router(); protectedRouter.use(authenticate(auth));
  protectedRouter.get('/admin/orders', requireRoles('SUPER_ADMIN', 'OPERATIONS'), async (req, res, next) => { try { const status = typeof req.query.status === 'string' ? z.nativeEnum(OrderStatus).parse(req.query.status) : undefined; const orders = await prisma.order.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' }, take: 100, select: orderSelect }); res.json({ orders }); } catch (error) { next(error); } });
  protectedRouter.get('/admin/orders/:id', requireRoles('SUPER_ADMIN', 'OPERATIONS'), async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const order = await prisma.order.findUnique({ where: { id }, select: orderSelect }); if (!order) throw new HttpError(404, 'Order not found'); res.json({ order }); } catch (error) { next(error); } });
  protectedRouter.patch('/admin/orders/:id/status', requireRoles('SUPER_ADMIN', 'OPERATIONS'), async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const nextStatus = z.nativeEnum(OrderStatus).parse(req.body.status); const order = await prisma.order.findUnique({ where: { id } }); if (!order) throw new HttpError(404, 'Order not found'); if (!orderTransitions[order.status].includes(nextStatus)) throw new HttpError(409, 'Invalid order status transition'); const updated = await prisma.$transaction(async (tx) => { const item = await tx.order.update({ where: { id }, data: { status: nextStatus } }); await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: nextStatus, actorUserId: req.user!.id, note: typeof req.body.note === 'string' ? req.body.note.slice(0, 300) : null } }); return item; }); res.json({ order: updated }); } catch (error) { next(error); } });
  protectedRouter.patch('/admin/order-items/:id/assignment', requireRoles('SUPER_ADMIN', 'OPERATIONS'), async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const partnerId = z.string().min(10).nullable().parse(req.body.partnerId); const item = await prisma.orderItem.findUnique({ where: { id } }); if (!item) throw new HttpError(404, 'Order item not found'); if (partnerId && !(await prisma.partner.findUnique({ where: { id: partnerId } }))) throw new HttpError(404, 'Partner not found'); await ensureAccrualsForOrder(prisma, item.orderId); const accrual = await prisma.financeAccrual.findUnique({ where: { orderItemId: item.id } }); if (accrual && accrual.partnerId !== partnerId) throw new HttpError(409, 'Item with recognized producer share cannot be reassigned'); const updated = await prisma.orderItem.update({ where: { id }, data: { partnerId, productionStatus: partnerId ? ProductionStatus.ASSIGNED : ProductionStatus.UNASSIGNED }, include: { partner: { select: { id: true, name: true, slug: true } } } }); res.json({ item: updated }); } catch (error) { next(error); } });
  protectedRouter.get('/partner/orders', requireRoles('PARTNER'), async (req, res, next) => { try { const partner = await prisma.partner.findUnique({ where: { userId: req.user!.id } }); if (!partner) throw new HttpError(404, 'Partner not found'); const items = await prisma.orderItem.findMany({ where: { partnerId: partner.id }, orderBy: { updatedAt: 'desc' }, select: { id: true, orderId: true, productNameSnapshot: true, productSlugSnapshot: true, quantity: true, productionStatus: true, order: { select: { orderNumber: true, status: true, shippingCity: true, shippingProvince: true, shippingPostalCode: true, createdAt: true } } } }); res.json({ items }); } catch (error) { next(error); } });
  protectedRouter.patch('/partner/order-items/:id/status', requireRoles('PARTNER'), async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const nextStatus = z.nativeEnum(ProductionStatus).parse(req.body.status); const partner = await prisma.partner.findUnique({ where: { userId: req.user!.id } }); if (!partner) throw new HttpError(404, 'Partner not found'); const item = await prisma.orderItem.findFirst({ where: { id, partnerId: partner.id } }); if (!item) throw new HttpError(404, 'Order item not found'); if (!productionTransitions[item.productionStatus].includes(nextStatus)) throw new HttpError(409, 'Invalid production status transition'); const updated = await prisma.orderItem.update({ where: { id }, data: { productionStatus: nextStatus } }); res.json({ item: updated }); } catch (error) { next(error); } });
  router.use('/api', protectedRouter);
  return router;
};
