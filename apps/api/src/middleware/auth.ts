import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';
import { AUTH_COOKIE, AuthService } from '../services/auth.js';
import type { Role } from '../types.js';
import { config } from '../config.js';

export const authenticate = (auth: AuthService): RequestHandler => async (req, _res, next) => {
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) throw new HttpError(401, 'Authentication required');
    const user = await auth.findById(auth.verify(token));
    if (!user) throw new HttpError(401, 'Authentication required');
    req.user = user;
    next();
  } catch { next(new HttpError(401, 'Authentication required')); }
};

export const requireRoles = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Forbidden'));
  next();
};

export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const allowed = origin === config.CORS_ORIGIN || (referer?.startsWith(`${config.CORS_ORIGIN}/`) ?? false);
  if (!allowed) return next(new HttpError(403, 'Forbidden'));
  next();
};
