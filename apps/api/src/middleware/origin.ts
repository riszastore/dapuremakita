import type { Request } from 'express';
import { config } from '../config.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Ambil origin kanonik dari sebuah URL/origin string; nilai tidak valid menghasilkan null. */
const originOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
};

const unique = (values: Array<string | null>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

/**
 * Daftar origin yang dipercaya:
 * - CORS_ORIGIN (konfigurasi utama, misal http://localhost:5173)
 * - CORS_ORIGINS (daftar tambahan dipisah koma, untuk preview/forwarded URL)
 * - origin API itu sendiri (host + protokol dari request, misal saat web dan API berbagi host)
 */
export const allowedOrigins = (req?: Request): string[] => {
  const configured = unique([config.CORS_ORIGIN, ...(config.CORS_ORIGINS ? config.CORS_ORIGINS.split(',') : [])].map((value) => originOf(value?.trim())));
  if (!req) return configured;
  const host = req.get('host');
  return unique([...configured, originOf(`${req.protocol}://${host ?? ''}`)]);
};

/** localhost, 127.0.0.1, dan [::1] dianggap setara pada protokol dan port yang sama. */
const sameLoopbackFamily = (left: string, right: string): boolean => {
  try {
    const a = new URL(left);
    const b = new URL(right);
    if (a.protocol !== b.protocol || a.port !== b.port) return false;
    return LOOPBACK_HOSTS.has(a.hostname) && LOOPBACK_HOSTS.has(b.hostname);
  } catch { return false; }
};

export const isAllowedOrigin = (origin: string | null | undefined, req?: Request): boolean => {
  const candidate = originOf(origin);
  if (!candidate) return false;
  return allowedOrigins(req).some((allowed) => allowed === candidate || sameLoopbackFamily(allowed, candidate));
};

/** Origin request: header Origin, atau fallback origin dari Referer (browser lama). */
export const requestOrigin = (req: Request): string | null => originOf(req.get('origin')) ?? originOf(req.get('referer'));

/**
 * Pemeriksaan CSRF/same-origin untuk semua request yang mengubah data:
 * 1. Bila Origin/Referer ada, wajib termasuk origin yang dipercaya.
 * 2. Bila keduanya tidak dikirim, izinkan hanya ketika browser menyatakan request berasal
 *    dari situs yang sama (Sec-Fetch-Site: same-origin/none). Klien non-browser (curl, skrip)
 *    tetap ditolak, sama seperti sebelumnya.
 */
export const isTrustedSameOrigin = (req: Request): boolean => {
  const origin = requestOrigin(req);
  if (origin) return isAllowedOrigin(origin, req);
  const site = req.get('sec-fetch-site');
  return site === 'same-origin' || site === 'none';
};

/** Callback untuk middleware `cors` memakai kebijakan origin yang sama dengan requireSameOrigin. */
export const corsOriginCallback = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void): void => {
  callback(null, origin ? isAllowedOrigin(origin) : false);
};
