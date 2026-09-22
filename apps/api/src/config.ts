import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Path .env selalu relatif terhadap file ini, bukan cwd, sehingga `npm test`,
 * `npx vitest --root`, dan server dev membaca berkas .env proyek yang sama.
 */
const envCandidates = [
  fileURLToPath(new URL('../../../.env', import.meta.url)),
  fileURLToPath(new URL('../../../../.env', import.meta.url)),
];
const defaultEnvPath = envCandidates.find((candidate) => existsSync(candidate)) ?? envCandidates[0];
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? defaultEnvPath });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32).default('local-development-secret-change-me-32chars'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+(s|m|h|d)$/).default('15m'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Daftar origin tambahan (pisah koma) untuk preview/forwarded URL; opsional. */
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  UPLOAD_DIR: z.string().min(1).default('./var/uploads'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(3).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000)
});
const parsed = schema.parse(process.env);
if (parsed.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production');
  if (!process.env.CORS_ORIGIN) throw new Error('CORS_ORIGIN is required in production');
  if (/localhost|127\.0\.0\.1|\[::1\]/.test(parsed.CORS_ORIGIN)) throw new Error('CORS_ORIGIN must not use loopback in production');
}
if (parsed.NODE_ENV !== 'test' && !parsed.DATABASE_URL) throw new Error('DATABASE_URL is required outside test');

const durationToMilliseconds = (duration: string) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) throw new Error('Invalid JWT_EXPIRES_IN');
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return Number(match[1]) * units[match[2] as keyof typeof units];
};

export const config = parsed;
export const jwtCookieMaxAgeMs = durationToMilliseconds(parsed.JWT_EXPIRES_IN);
