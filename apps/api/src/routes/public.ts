import { Router } from 'express';
import { z } from 'zod';
import type { CatalogRepository } from '../repository.js';
import type { PrismaClient } from '@prisma/client';
import { publicSiteContent } from './site-content.js';
import { HttpError } from '../middleware/errors.js';

const querySchema = z.object({ search: z.string().trim().max(80).optional(), category: z.string().regex(/^[a-z0-9-]+$/).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) });
export const publicRouter = (catalog: CatalogRepository, prisma: PrismaClient) => {
  const router = Router();
  router.get('/site-content', async (_req, res, next) => { try { res.json({ content: await publicSiteContent(prisma) }); } catch (error) { next(error); } });
  router.get('/categories', async (_req, res, next) => { try { res.json({ categories: await catalog.listCategories() }); } catch (error) { next(error); } });
  router.get('/products', async (req, res, next) => { try { const query = querySchema.parse(req.query); const result = await catalog.listProducts(query); res.json({ ...result, page: query.page, limit: query.limit, totalPages: Math.ceil(result.total / query.limit) }); } catch (error) { next(error); } });
  router.get('/products/:slug', async (req, res, next) => { try { const product = await catalog.findProduct(req.params.slug); if (!product) throw new HttpError(404, 'Product not found'); res.json({ product }); } catch (error) { next(error); } });
  router.get('/partners', async (_req, res, next) => { try { res.json({ partners: await catalog.listPartners() }); } catch (error) { next(error); } });
  return router;
};