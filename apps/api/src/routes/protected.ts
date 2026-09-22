import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { partnerRouter } from './partner.js';
import { adminRouter } from './admin.js';
import { adminFinanceRouter, nazhirFinanceRouter } from './finance.js';

export const protectedRouter = (auth: AuthService, prisma: PrismaClient) => {
  const router = Router();
  router.use(authenticate(auth));
  router.use('/admin/finance', adminFinanceRouter(prisma, auth));
  router.use('/admin', adminRouter(prisma, auth));
  router.get('/partner/overview', requireRoles('PARTNER'), (req, res) => res.json({ area: 'partner', viewer: req.user }));
  router.use('/partner', partnerRouter(prisma, auth));
  router.get('/nazhir/overview', requireRoles('NAZHIR_VIEWER'), (req, res) => res.json({ area: 'nazhir', viewer: req.user, readOnly: true }));
  router.use('/nazhir/finance', nazhirFinanceRouter(prisma, auth));
  return router;
};
