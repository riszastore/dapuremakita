import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { FinanceAccrualStatus, PayoutStatus, PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.js';
import { authenticate, requireRoles, requireSameOrigin } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { FinanceService } from '../services/finance.js';

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{10,}$/);
const FinanceAccrualStatusSchema = z.nativeEnum(FinanceAccrualStatus);
const PayoutStatusSchema = z.nativeEnum(PayoutStatus);
const financeMutationLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

/** Query gabungan untuk seluruh endpoint finance: range tanggal (paidAt/createdAt) dan paginasi. */
export const financeQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    partnerId: z.string().regex(/^[a-zA-Z0-9_-]{10,}$/).optional(),
    status: z.string().regex(/^[A-Z_]+$/).optional(),
    type: z.enum(['ORDER', 'PAYOUT']).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'Invalid date range' });

const payoutCreateSchema = z
  .object({
    idempotencyKey: z.string().trim().min(16).max(100),
    partnerId: z.string().min(10).max(60),
    accrualIds: z.array(z.string().min(10).max(60)).min(1).max(500).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const rangeOf = (query: { from?: string; to?: string }) => ({ from: query.from, to: query.to });

const requireFinanceWriter: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') return next(new HttpError(403, 'Forbidden'));
  next();
};

const readRoutes = (router: Router, finance: FinanceService) => {
  router.get('/summary', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      res.json({ summary: await finance.summary(rangeOf(query)) });
    } catch (error) { next(error); }
  });

  router.get('/transactions', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      res.json(await finance.transactions(rangeOf(query), query.page, query.limit, query.type));
    } catch (error) { next(error); }
  });

  router.get('/accruals', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      const status = query.status ? FinanceAccrualStatusSchema.parse(query.status) : undefined;
      res.json(await finance.accruals({ page: query.page, limit: query.limit, partnerId: query.partnerId, status }));
    } catch (error) { next(error); }
  });

  router.get('/payouts', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      const status = query.status ? PayoutStatusSchema.parse(query.status) : undefined;
      res.json(await finance.listPayouts({ page: query.page, limit: query.limit, partnerId: query.partnerId, status }));
    } catch (error) { next(error); }
  });

  router.get('/payouts/:id', async (req, res, next) => {
    try { res.json({ payout: await finance.getPayout(idSchema.parse(req.params.id)) }); } catch (error) { next(error); }
  });

  router.get('/reports/products', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      res.json(await finance.reportProducts(rangeOf(query), query.limit));
    } catch (error) { next(error); }
  });

  router.get('/reports/partners', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      res.json(await finance.reportPartners(rangeOf(query), query.limit));
    } catch (error) { next(error); }
  });

  router.get('/reports/impact', async (req, res, next) => {
    try {
      const query = financeQuerySchema.parse(req.query);
      res.json(await finance.reportImpact(rangeOf(query)));
    } catch (error) { next(error); }
  });
};

/** Dashboard finance admin: baca untuk SUPER_ADMIN/OPERATIONS, tulis payout hanya SUPER_ADMIN. */
export const adminFinanceRouter = (prisma: PrismaClient, auth: AuthService) => {
  const router = Router();
  router.use(authenticate(auth));
  router.use(requireRoles('SUPER_ADMIN', 'OPERATIONS'));
  const finance = new FinanceService(prisma);
  readRoutes(router, finance);

  router.post('/payouts', financeMutationLimiter, requireSameOrigin, requireFinanceWriter, async (req, res, next) => {
    try {
      const values = payoutCreateSchema.parse(req.body);
      const result = await finance.createPayout({ ...values, actorUserId: req.user!.id });
      res.status(result.idempotent ? 200 : 201).json(result);
    } catch (error) { next(error); }
  });

  router.post('/payouts/:id/complete', financeMutationLimiter, requireSameOrigin, requireFinanceWriter, async (req, res, next) => {
    try { res.json({ payout: await finance.completePayout(idSchema.parse(req.params.id), req.user!.id) }); } catch (error) { next(error); }
  });

  router.post('/payouts/:id/cancel', financeMutationLimiter, requireSameOrigin, requireFinanceWriter, async (req, res, next) => {
    try { res.json({ payout: await finance.cancelPayout(idSchema.parse(req.params.id), req.user!.id) }); } catch (error) { next(error); }
  });

  return router;
};

/** View Nazhir: seluruh route di router ini hanya GET sehingga akun Nazhir murni read-only. */
export const nazhirFinanceRouter = (prisma: PrismaClient, auth: AuthService) => {
  const router = Router();
  router.use(authenticate(auth));
  router.use(requireRoles('NAZHIR_VIEWER'));
  readRoutes(router, new FinanceService(prisma));
  return router;
};
