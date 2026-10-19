import {
  bulkConfirmBodySchema,
  bulkConfirmResponseSchema,
  bulkPreviewBodySchema,
  bulkPreviewResponseSchema,
  employeeDetailSchema,
  employeeIdParamsSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
  newEmployeeSchema,
  salaryChangeSchema,
  updateEmployeeSchema,
} from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import {
  createEmployee,
  deactivateEmployee,
  reactivateEmployee,
  updateEmployee,
} from '../services/employees';
import { confirmBulkRevision, previewBulkRevision } from '../services/bulk-revision';
import { recordSalaryChange } from '../services/salary-changes';
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

    // Static paths: find-my-way ranks them above `/api/employees/:id`.
    app.post(
      '/api/employees/bulk-salary-changes/preview',
      {
        schema: {
          body: bulkPreviewBodySchema,
          response: { 200: bulkPreviewResponseSchema },
        },
      },
      (request) => {
        const { filter, employeeIds, percentageBp } = request.body;
        return previewBulkRevision(
          database.db,
          employeeIds !== undefined
            ? { employeeIds, percentageBp }
            : { filter: filter ?? {}, percentageBp },
        );
      },
    );

    app.post(
      '/api/employees/bulk-salary-changes',
      {
        schema: {
          body: bulkConfirmBodySchema,
          response: { 201: bulkConfirmResponseSchema },
        },
      },
      (request, reply) => {
        void reply.code(201);
        return confirmBulkRevision(database.db, request.body, writerDeps);
      },
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

    app.patch(
      '/api/employees/:id',
      {
        schema: {
          params: employeeIdParamsSchema,
          body: updateEmployeeSchema,
          response: { 200: employeeDetailSchema },
        },
      },
      (request) => {
        updateEmployee(database.db, request.params.id, request.body, writerDeps);
        return getEmployeeDetail(database.db, request.params.id);
      },
    );

    app.delete(
      '/api/employees/:id',
      { schema: { params: employeeIdParamsSchema, response: { 200: employeeDetailSchema } } },
      (request) => {
        deactivateEmployee(database.db, request.params.id, writerDeps);
        return getEmployeeDetail(database.db, request.params.id);
      },
    );

    app.post(
      '/api/employees/:id/reactivate',
      { schema: { params: employeeIdParamsSchema, response: { 200: employeeDetailSchema } } },
      (request) => {
        reactivateEmployee(database.db, request.params.id, writerDeps);
        return getEmployeeDetail(database.db, request.params.id);
      },
    );

    app.post(
      '/api/employees/:id/salary-changes',
      {
        schema: {
          params: employeeIdParamsSchema,
          body: salaryChangeSchema,
          response: { 201: employeeDetailSchema },
        },
      },
      (request, reply) => {
        recordSalaryChange(database.db, request.params.id, request.body, writerDeps);
        void reply.code(201);
        return getEmployeeDetail(database.db, request.params.id);
      },
    );

    return Promise.resolve();
  };
