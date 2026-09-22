import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { PrismaCatalogRepository, PrismaUserRepository, type CatalogRepository } from './repository.js';
import { AuthService } from './services/auth.js';
import { authRouter } from './routes/auth.js';
import { protectedRouter } from './routes/protected.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { readOnlyAccountGuard } from './middleware/auth.js';
import { corsOriginCallback } from './middleware/origin.js';
import { publicRouter } from './routes/public.js';
import { orderRouter } from './routes/order.js';
import { requestObservability } from './middleware/observability.js';
import { config } from './config.js';

export const createApp = (auth?: AuthService, catalog?: CatalogRepository, prisma = new PrismaClient()) => {
  const authService = auth ?? new AuthService(new PrismaUserRepository(prisma));
  const catalogRepository = catalog ?? new PrismaCatalogRepository(prisma);
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
  app.use(requestObservability);
  app.use(helmet());
  app.use(cors({ origin: corsOriginCallback, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(readOnlyAccountGuard(authService));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });
  app.use('/public', publicRouter(catalogRepository));
  app.use('/auth/login', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/auth', authRouter(authService));
  app.use('/', orderRouter(prisma, authService));
  app.use('/api', protectedRouter(authService, prisma));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};
