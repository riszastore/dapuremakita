import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import { AUTH_COOKIE } from '../services/auth.js';
import { HttpError } from '../middleware/errors.js';
import { authenticate, requireSameOrigin } from '../middleware/auth.js';
import { jwtCookieMaxAgeMs } from '../config.js';

const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) }).strict();
export const authRouter = (auth: AuthService) => {
  const router = Router();
  router.post('/login', requireSameOrigin, async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const result = await auth.login(email.toLowerCase(), password);
      if (!result) throw new HttpError(401, 'Invalid email or password');
      res.cookie(AUTH_COOKIE, result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: jwtCookieMaxAgeMs });
      res.json({ user: result.user });
    } catch (error) { next(error); }
  });
  router.post('/logout', requireSameOrigin, (_req, res) => { res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }); res.status(204).send(); });
  router.get('/me', authenticate(auth), (req, res) => res.json({ user: req.user }));
  return router;
};
