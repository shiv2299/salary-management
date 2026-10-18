import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { healthResponseSchema } from '@acme/shared';
import { buildApp } from '../app';
import { createDatabase, type Database } from '../db/client';

describe('GET /api/health', () => {
  let database: Database;
  let app: FastifyInstance;

  beforeEach(() => {
    database = createDatabase(':memory:');
    app = buildApp({ database });
  });

  afterEach(async () => {
    await app.close();
    database.close();
  });

  it('returns 200 with a body that matches the shared health schema', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: 'ok', database: 'ok' });
  });

  it('reports the database as errored when it cannot be reached', async () => {
    database.close();

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'error' });
  });
});
