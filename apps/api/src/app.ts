import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from './repository.js';
import { AuthService } from './services/auth.js';
import { authRouter } from './routes/auth.js';
import { protectedRouter } from './routes/protected.js';
import { errorHandler, notFound } from './middleware/errors.js';

export const createApp = (auth = new AuthService(new PrismaUserRepository(new PrismaClient()))) => {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/auth/login', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/auth', authRouter(auth));
  app.use('/api', protectedRouter(auth));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};
