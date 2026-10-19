import {
  employeeDetailSchema,
  employeeIdParamsSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
  newEmployeeSchema,
} from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import { createEmployee } from '../services/employees';
import { getEmployeeDetail } from '../services/employee-detail';
import { listEmployees } from '../services/employee-list';

export interface EmployeeRoutesDeps {
  database: Database;
  now: () => Date;
}

export const employeeRoutes =
  ({ database, now }: EmployeeRoutesDeps): FastifyPluginAsyncZod =>
  (app) => {
    const writerDeps = { now: () => now().toISOString() };

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

    app.post(
      '/api/employees',
      { schema: { body: newEmployeeSchema, response: { 201: employeeDetailSchema } } },
      (request, reply) => {
        const id = createEmployee(database.db, request.body, writerDeps);
        void reply.code(201);
        return getEmployeeDetail(database.db, id);
      },
    );

    return Promise.resolve();
  };
