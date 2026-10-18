import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { createDatabase, type Database } from './db/client';

describe('app', () => {
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

  it('answers an unknown api route with a JSON 404 in the standard error shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' },
    });
  });
});
