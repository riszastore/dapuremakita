import { Router } from 'express';
import type { AuthService } from '../services/auth.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

export const protectedRouter = (auth: AuthService) => {
  const router = Router();
  router.use(authenticate(auth));
  router.get('/admin/overview', requireRoles('SUPER_ADMIN', 'CURATOR', 'OPERATIONS'), (req, res) => res.json({ area: 'admin', viewer: req.user }));
  router.get('/partner/overview', requireRoles('PARTNER'), (req, res) => res.json({ area: 'partner', viewer: req.user }));
  router.get('/nazhir/overview', requireRoles('NAZHIR_VIEWER'), (req, res) => res.json({ area: 'nazhir', viewer: req.user, readOnly: true }));
  return router;
};
