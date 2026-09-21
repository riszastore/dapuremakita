import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, PartnerStatus, ProductStatus, SubmissionStatus } from '@prisma/client';
import type { AuthService } from '../services/auth.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{10,}$/);
const scoreSchema = z.object({
  productFeasibility: z.number().int().min(1).max(5),
  qualityConsistency: z.number().int().min(1).max(5),
  legality: z.number().int().min(1).max(5),
  productionCapacity: z.number().int().min(1).max(5),
  pricingHpp: z.number().int().min(1).max(5),
  packagingBranding: z.number().int().min(1).max(5),
  marketReadiness: z.number().int().min(1).max(5),
  decisionThreshold: z.number().int().min(1).max(100).default(70),
}).strict();

const finalizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().min(10).max(1500),
  categoryId: z.string().min(1),
  price: z.coerce.number().int().min(1000).max(100_000_000),
  imageUrl: z.string().trim().min(1).max(300),
  partnerInfo: z.string().trim().max(400).optional(),
  metadata: z.string().trim().max(900).optional(),
}).strict();

const adminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  status: z.string().trim().optional(),
  partnerId: z.string().trim().optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'name']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).strict();

const transitionMatrix: Record<SubmissionStatus, SubmissionStatus[]> = {
  DRAFT: [SubmissionStatus.SUBMITTED],
  SUBMITTED: [SubmissionStatus.UNDER_REVIEW, SubmissionStatus.REJECTED],
  UNDER_REVIEW: [SubmissionStatus.REVISION_REQUIRED, SubmissionStatus.APPROVED, SubmissionStatus.REJECTED],
  REVISION_REQUIRED: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW],
  APPROVED: [SubmissionStatus.READY_TO_PUBLISH, SubmissionStatus.REJECTED],
  READY_TO_PUBLISH: [SubmissionStatus.ACTIVE, SubmissionStatus.APPROVED],
  ACTIVE: [SubmissionStatus.SUSPENDED, SubmissionStatus.ARCHIVED],
  SUSPENDED: [SubmissionStatus.ACTIVE, SubmissionStatus.ARCHIVED],
  ARCHIVED: [SubmissionStatus.ACTIVE],
  REJECTED: [],
};

const isAllowedTransition = (from: SubmissionStatus, to: SubmissionStatus) => {
  const normalizedFrom = (from as string) === 'IN_REVIEW' ? 'UNDER_REVIEW' : from;
  const normalizedTo = (to as string) === 'IN_REVIEW' ? 'UNDER_REVIEW' : to;
  return transitionMatrix[normalizedFrom as SubmissionStatus]?.includes(normalizedTo as SubmissionStatus) ?? false;
};

const coerceStatus = (status: string | undefined) => {
  if (!status) return undefined;
  return status === 'IN_REVIEW' ? SubmissionStatus.UNDER_REVIEW : status as SubmissionStatus;
};

const scoreFields = ['productFeasibility', 'qualityConsistency', 'legality', 'productionCapacity', 'pricingHpp', 'packagingBranding', 'marketReadiness'] as const;

const curatorRoles = ['SUPER_ADMIN', 'CURATOR'] as const;
const requireCurator = (role: string) => {
  if (!curatorRoles.includes(role as typeof curatorRoles[number])) throw new HttpError(403, 'Forbidden');
};

const scoreIsComplete = (score: Partial<Record<typeof scoreFields[number], number | null>> | null) => {
  if (!score) return false;
  return scoreFields.every((field) => typeof score[field] === 'number' && score[field] !== null && Number(score[field]) >= 1 && Number(score[field]) <= 5);
};

const logAudit = async (tx: Parameters<PrismaClient['$transaction']>[0] extends (arg: infer T) => any ? T : never, submissionId: string | null, actorUserId: string | null, entityType: string, entityId: string, action: string, details?: string) => {
  await tx.auditLog.create({
    data: {
      submissionId,
      actorUserId,
      entityType,
      entityId,
      action,
      details,
    },
  });
};

export const adminRouter = (prisma: PrismaClient, auth: AuthService) => {
  const router = Router();
  router.use(authenticate(auth));
  router.use(requireRoles('SUPER_ADMIN', 'CURATOR', 'OPERATIONS'));

  router.get('/overview', async (_req, res, next) => {
    try {
      const [partners, submissions, activeProducts, partnersPending] = await Promise.all([
        prisma.partner.count(),
        prisma.productSubmission.count(),
        prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
        prisma.partner.count({ where: { status: PartnerStatus.PENDING } }),
      ]);

      const queue = await prisma.productSubmission.findMany({
        where: { status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW, SubmissionStatus.REVISION_REQUIRED, SubmissionStatus.APPROVED] } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          partner: { select: { name: true, slug: true } },
        },
      });

      const recent = await prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: { id: true, action: true, createdAt: true, entityType: true, actor: { select: { name: true, role: true } } },
      });

      res.json({
        stats: {
          partners,
          submissions,
          activeProducts,
          pendingPartners: partnersPending,
        },
        queue,
        recent,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/partners', async (req, res, next) => {
    try {
      const query = adminQuerySchema.parse(req.query);
      const where = {
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { slug: { contains: query.search, mode: 'insensitive' as const } }] } : {}),
        ...(query.status ? { status: query.status as PartnerStatus } : {}),
        ...(query.partnerId ? { id: query.partnerId } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.partner.findMany({
          where,
          orderBy: { [query.sort]: query.order },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { email: true, role: true } },
          },
        }),
        prisma.partner.count({ where }),
      ]);
      res.json({ items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/partners/:id', async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const partner = await prisma.partner.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, email: true, role: true } },
          profile: true,
          legalDocuments: { orderBy: { createdAt: 'desc' } },
          submissions: { orderBy: { updatedAt: 'desc' }, take: 10 },
        },
      });
      if (!partner) throw new HttpError(404, 'Partner not found');
      res.json({ partner });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/partners/:id/status', async (req, res, next) => {
    try {
      if (!['SUPER_ADMIN', 'OPERATIONS'].includes(req.user!.role)) {
        throw new HttpError(403, 'Forbidden');
      }
      const id = idSchema.parse(req.params.id);
      const status = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).parse(req.body.status);
      const partner = await prisma.partner.update({
        where: { id },
        data: { status: status as PartnerStatus },
      });
      await prisma.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          entityType: 'Partner',
          entityId: partner.id,
          action: 'PARTNER_STATUS_UPDATED',
          details: JSON.stringify({ status }),
        },
      });
      res.json({ partner });
    } catch (error) {
      next(error);
    }
  });

  router.get('/submissions', async (req, res, next) => {
    try {
      const query = adminQuerySchema.parse(req.query);
      const where = {
        ...(coerceStatus(query.status) ? { status: coerceStatus(query.status) } : {}),
        ...(query.partnerId ? { partnerId: query.partnerId } : {}),
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { description: { contains: query.search, mode: 'insensitive' as const } }] } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.productSubmission.findMany({
          where,
          orderBy: { [query.sort]: query.order },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            submittedAt: true,
            partner: { select: { id: true, name: true, slug: true } },
            category: { select: { id: true, name: true, slug: true } },
            scores: { select: { total: true, status: true, decisionThreshold: true, updatedAt: true } },
          },
        }),
        prisma.productSubmission.count({ where }),
      ]);
      res.json({ items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/submissions/:id', async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const submission = await prisma.productSubmission.findUnique({
        where: { id },
        include: {
          partner: { include: { user: { select: { id: true, email: true, role: true } }, profile: true, legalDocuments: true } },
          category: true,
          photos: true,
          revisions: { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
          notes: { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
          decisions: { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
          scores: { include: { curator: { select: { id: true, name: true, role: true } } } },
          finalization: true,
          publication: true,
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
      if (!submission) throw new HttpError(404, 'Submission not found');
      res.json({ submission });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/review', async (req, res, next) => {
    try {
      requireCurator(req.user!.role);
      const id = idSchema.parse(req.params.id);
      const submission = await prisma.productSubmission.findUnique({ where: { id } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      if (!['SUBMITTED', 'REVISION_REQUIRED', 'UNDER_REVIEW'].includes(submission.status)) {
        throw new HttpError(409, 'Invalid status transition');
      }
      const nextStatus = SubmissionStatus.UNDER_REVIEW;
      const valid = isAllowedTransition(submission.status, nextStatus);
      if (!valid) throw new HttpError(409, 'Invalid status transition');
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.productSubmission.update({ where: { id }, data: { status: nextStatus, updatedAt: new Date() } });
        await tx.submissionRevision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: nextStatus } });
        await tx.submissionDecision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: nextStatus, decision: 'START_REVIEW' } });
        await logAudit(tx, id, req.user!.id, 'ProductSubmission', id, 'REVIEW_STARTED', JSON.stringify({ from: submission.status, to: nextStatus }));
        return item;
      });
      res.json({ submission: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/score', async (req, res, next) => {
    try {
      requireCurator(req.user!.role);
      const id = idSchema.parse(req.params.id);
      const values = scoreSchema.parse(req.body);
      const submission = await prisma.productSubmission.findUnique({ where: { id } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      const subtotal = scoreFields.reduce((sum, field) => sum + values[field], 0);
      const total = Math.round((subtotal / (scoreFields.length * 5)) * 100);
      const payload = {
        submissionId: id,
        curatorUserId: req.user!.id,
        productFeasibility: values.productFeasibility,
        qualityConsistency: values.qualityConsistency,
        legality: values.legality,
        productionCapacity: values.productionCapacity,
        pricingHpp: values.pricingHpp,
        packagingBranding: values.packagingBranding,
        marketReadiness: values.marketReadiness,
        subtotal,
        total,
        completionPercent: 100,
        decisionThreshold: values.decisionThreshold,
        status: 'COMPLETE',
      };
      const score = await prisma.$transaction(async (tx) => {
        const item = await tx.submissionScore.upsert({
          where: { submissionId_curatorUserId: { submissionId: id, curatorUserId: req.user!.id } },
          update: payload,
          create: payload,
        });
        await logAudit(tx, id, req.user!.id, 'SubmissionScore', item.id, 'SCORE_SAVED', JSON.stringify({ total }));
        return item;
      });
      res.json({ score });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/notes', async (req, res, next) => {
    try {
      requireCurator(req.user!.role);
      const id = idSchema.parse(req.params.id);
      const body = z.object({ note: z.string().trim().min(4).max(2000), reason: z.string().trim().max(500).optional(), partnerVisible: z.boolean().default(false) }).strict().parse(req.body);
      const submission = await prisma.productSubmission.findUnique({ where: { id } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      const note = await prisma.$transaction(async (tx) => {
        const item = await tx.curatorNote.create({
          data: {
            submissionId: id,
            actorUserId: req.user!.id,
            note: body.note,
            reason: body.reason ?? null,
            partnerVisible: body.partnerVisible,
          },
        });
        await logAudit(tx, id, req.user!.id, 'CuratorNote', item.id, 'NOTE_CREATED', JSON.stringify({ partnerVisible: body.partnerVisible }));
        return item;
      });
      res.status(201).json({ note });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/revision', async (req, res, next) => {
    try {
      requireCurator(req.user!.role);
      const id = idSchema.parse(req.params.id);
      const body = z.object({ reason: z.string().trim().min(4).max(2000) }).strict().parse(req.body);
      const submission = await prisma.productSubmission.findUnique({ where: { id } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      const target = SubmissionStatus.REVISION_REQUIRED;
      if (!isAllowedTransition(submission.status, target)) throw new HttpError(409, 'Invalid status transition');
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.productSubmission.update({ where: { id }, data: { status: target } });
        await tx.submissionRevision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: target, note: body.reason } });
        await tx.submissionDecision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: target, decision: 'REVISION_REQUIRED', reason: body.reason } });
        await logAudit(tx, id, req.user!.id, 'ProductSubmission', id, 'REVISION_REQUESTED', body.reason);
        return item;
      });
      res.json({ submission: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/reject', async (req, res, next) => {
    try {
      requireCurator(req.user!.role);
      const id = idSchema.parse(req.params.id);
      const body = z.object({ reason: z.string().trim().min(4).max(2000) }).strict().parse(req.body);
      const submission = await prisma.productSubmission.findUnique({ where: { id } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      const target = SubmissionStatus.REJECTED;
      if (!isAllowedTransition(submission.status, target)) throw new HttpError(409, 'Invalid status transition');
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.productSubmission.update({ where: { id }, data: { status: target } });
        await tx.submissionRevision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: target, note: body.reason } });
        await tx.submissionDecision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: target, decision: 'REJECTED', reason: body.reason } });
        await logAudit(tx, id, req.user!.id, 'ProductSubmission', id, 'REJECTED', body.reason);
        return item;
      });
      res.json({ submission: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/approve', async (req, res, next) => {
    try {
      requireCurator(req.user!.role);
      const id = idSchema.parse(req.params.id);
      const submission = await prisma.productSubmission.findUnique({ where: { id }, include: { scores: true } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      const score = submission.scores[0] ?? null;
      if (!score || !scoreIsComplete(score)) throw new HttpError(400, 'Scoring is incomplete');
      if (score.total < score.decisionThreshold) throw new HttpError(400, 'Score threshold not reached');
      if (!isAllowedTransition(submission.status, SubmissionStatus.APPROVED)) throw new HttpError(409, 'Invalid status transition');
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.productSubmission.update({ where: { id }, data: { status: SubmissionStatus.APPROVED, updatedAt: new Date() } });
        await tx.submissionRevision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: SubmissionStatus.APPROVED } });
        await tx.submissionDecision.create({ data: { submissionId: id, actorUserId: req.user!.id, fromStatus: submission.status, toStatus: SubmissionStatus.APPROVED, decision: 'APPROVED' } });
        await logAudit(tx, id, req.user!.id, 'ProductSubmission', id, 'APPROVED', JSON.stringify({ total: score.total }));
        return item;
      });
      res.json({ submission: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/finalize', async (req, res, next) => {
    try {
      if (req.user!.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Forbidden');
      const id = idSchema.parse(req.params.id);
      const values = finalizationSchema.parse(req.body);
      const submission = await prisma.productSubmission.findUnique({ where: { id }, include: { category: true, partner: true } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      if (submission.status !== SubmissionStatus.APPROVED) throw new HttpError(400, 'Submission must be approved before finalization');
      const category = await prisma.category.findUnique({ where: { id: values.categoryId } });
      if (!category) throw new HttpError(400, 'Invalid category');
      const existing = await prisma.product.findUnique({ where: { slug: values.slug } });
      if (existing) throw new HttpError(409, 'Slug already in use');
      const finalData = await prisma.$transaction(async (tx) => {
        const finalization = await tx.productFinalization.upsert({
          where: { submissionId: id },
          update: {
            finalName: values.name,
            slug: values.slug,
            description: values.description,
            categoryId: category.id,
            price: values.price,
            imageUrl: values.imageUrl,
            partnerInfo: values.partnerInfo ?? null,
            metadata: values.metadata ?? null,
            approvedByUserId: req.user!.id,
          },
          create: {
            submissionId: id,
            finalName: values.name,
            slug: values.slug,
            description: values.description,
            categoryId: category.id,
            price: values.price,
            imageUrl: values.imageUrl,
            partnerInfo: values.partnerInfo ?? null,
            metadata: values.metadata ?? null,
            approvedByUserId: req.user!.id,
          },
        });
        await tx.productSubmission.update({ where: { id }, data: { status: SubmissionStatus.READY_TO_PUBLISH, updatedAt: new Date() } });
        await logAudit(tx, id, req.user!.id, 'ProductFinalization', finalization.id, 'FINALIZED', JSON.stringify({ slug: values.slug }));
        return { finalization, status: SubmissionStatus.READY_TO_PUBLISH };
      });
      res.status(201).json(finalData);
    } catch (error) {
      next(error);
    }
  });

  router.post('/submissions/:id/publish', async (req, res, next) => {
    try {
      if (req.user!.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Forbidden');
      const id = idSchema.parse(req.params.id);
      const submission = await prisma.productSubmission.findUnique({ where: { id }, include: { finalization: true, partner: true } });
      if (!submission) throw new HttpError(404, 'Submission not found');
      if (submission.status !== SubmissionStatus.READY_TO_PUBLISH) throw new HttpError(400, 'Submission must be finalized before publish');
      const finalization = submission.finalization;
      if (!finalization) throw new HttpError(400, 'Submission must be finalized before publish');
      const existingProduct = await prisma.product.findUnique({ where: { slug: finalization.slug } });
      if (existingProduct && existingProduct.status === ProductStatus.ACTIVE) {
        const existingPublication = await prisma.productPublication.findFirst({ where: { submissionId: id } });
        res.json({ idempotent: true, publication: existingPublication ?? { submissionId: id, productId: existingProduct.id, status: ProductStatus.ACTIVE }, product: existingProduct });
        return;
      }
      if (existingProduct) throw new HttpError(409, 'Slug already in use');
      const updated = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: finalization.finalName,
            slug: finalization.slug,
            description: finalization.description,
            price: finalization.price,
            imageUrl: finalization.imageUrl,
            categoryId: finalization.categoryId,
            partnerId: submission.partnerId,
            status: ProductStatus.ACTIVE,
          },
        });
        const publication = await tx.productPublication.upsert({
          where: { submissionId: id },
          update: { productId: product.id, partnerId: submission.partnerId, publishedByUserId: req.user!.id, status: ProductStatus.ACTIVE },
          create: { submissionId: id, productId: product.id, partnerId: submission.partnerId, publishedByUserId: req.user!.id, status: ProductStatus.ACTIVE },
        });
        await tx.productSubmission.update({ where: { id }, data: { status: SubmissionStatus.ACTIVE, updatedAt: new Date() } });
        await logAudit(tx, id, req.user!.id, 'ProductPublication', publication.id, 'PUBLISHED', JSON.stringify({ productId: product.id, slug: product.slug }));
        return { product, publication };
      });
      res.json({ idempotent: false, ...updated });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
