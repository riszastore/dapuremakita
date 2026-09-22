import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';
import { AUTH_COOKIE, AuthService } from '../services/auth.js';
import type { Role } from '../types.js';
import { isTrustedSameOrigin } from './origin.js';

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

/**
 * Guard CSRF untuk seluruh request yang mengubah data (login, logout, checkout, payout, dst).
 * Kebijakan ada di `middleware/origin.ts`: origin yang dipercaya, loopback setara, atau
 * sinyal `Sec-Fetch-Site` dari browser; request lintas situs dan klien tanpa identitas asal
 * tetap ditolak 403. Nazhir tidak terpengaruh karena login/logout memakai jalur `/auth/`.
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  if (isTrustedSameOrigin(req)) return next();
  next(new HttpError(403, 'Forbidden'));
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard backend untuk akun NAZHIR_VIEWER: menolak seluruh request non-GET di mana pun
 * (kecuali alur auth seperti login/logout), sehingga Nazhir read-only bukan sekadar keputusan UI.
 */
export const readOnlyAccountGuard = (auth: AuthService): RequestHandler => async (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path.startsWith('/auth/')) return next();
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return next();
    const user = await auth.findById(auth.verify(token));
    if (user?.role === 'NAZHIR_VIEWER') return next(new HttpError(403, 'Read-only account'));
  } catch { /* biarkan route menangani kegagalan autentikasi */ }
  next();
};
