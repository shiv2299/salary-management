import { healthResponseSchema } from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';

export const healthRoutes =
  (database: Database): FastifyPluginAsyncZod =>
  (app) => {
    app.get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, (request) => {
      try {
        database.ping();
        return { status: 'ok' as const, database: 'ok' as const };
      } catch (error) {
        request.log.error(error, 'database health check failed');
        return { status: 'ok' as const, database: 'error' as const };
      }
    });
    return Promise.resolve();
  };
