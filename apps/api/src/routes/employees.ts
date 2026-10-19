import { employeeListQuerySchema, employeeListResponseSchema } from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import { listEmployees } from '../services/employee-list';

export const employeeRoutes =
  (database: Database): FastifyPluginAsyncZod =>
  (app) => {
    app.get(
      '/api/employees',
      {
        schema: {
          querystring: employeeListQuerySchema,
          response: { 200: employeeListResponseSchema },
        },
      },
      (request) => listEmployees(database.db, request.query),
    );

    return Promise.resolve();
  };
