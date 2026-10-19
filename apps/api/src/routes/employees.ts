import {
  employeeDetailSchema,
  employeeIdParamsSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
} from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import { getEmployeeDetail } from '../services/employee-detail';
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

    app.get(
      '/api/employees/:id',
      {
        schema: {
          params: employeeIdParamsSchema,
          response: { 200: employeeDetailSchema },
        },
      },
      (request) => getEmployeeDetail(database.db, request.params.id),
    );

    return Promise.resolve();
  };
