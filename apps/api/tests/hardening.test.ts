import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const prismaStub = (ready: boolean) => ({
  $queryRaw: ready ? vi.fn().mockResolvedValue([{ ok: 1 }]) : vi.fn().mockRejectedValue(new Error('db unavailable')),
}) as unknown as PrismaClient;

describe('Batch 7 production hardening', () => {
  it('adds a request id while keeping liveness simple', async () => {
    const response = await request(createApp(undefined, undefined, prismaStub(true))).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[a-z0-9-]{8,}$/i);
  });

  it('reports readiness only when the database responds', async () => {
    const response = await request(createApp(undefined, undefined, prismaStub(true))).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('returns 503 readiness without leaking database errors', async () => {
    const response = await request(createApp(undefined, undefined, prismaStub(false))).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
    expect(response.text).not.toContain('db unavailable');
  });
});
