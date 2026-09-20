import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? '../../.env' });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32).default('local-development-secret-change-me-32chars'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+(s|m|h|d)$/).default('15m'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional()
});
const parsed = schema.parse(process.env);
if (parsed.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET is required in production');
if (parsed.NODE_ENV !== 'test' && !parsed.DATABASE_URL) throw new Error('DATABASE_URL is required outside test');

const durationToMilliseconds = (duration: string) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) throw new Error('Invalid JWT_EXPIRES_IN');
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return Number(match[1]) * units[match[2] as keyof typeof units];
};

export const config = parsed;
export const jwtCookieMaxAgeMs = durationToMilliseconds(parsed.JWT_EXPIRES_IN);
