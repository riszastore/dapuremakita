import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
export const notFound = (_req: unknown, _res: unknown, next: (error: Error) => void) => next(new HttpError(404, 'Not found'));
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError || error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
  if (error?.type === 'entity.too.large' || error?.status === 413 || error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Request body too large' });
  if (error?.code === 'LIMIT_PART_COUNT' || error?.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Invalid request' });
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
};
