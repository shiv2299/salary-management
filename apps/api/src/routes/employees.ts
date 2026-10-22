import {
  bulkConfirmBodySchema,
  bulkConfirmResponseSchema,
  bulkPreviewBodySchema,
  bulkPreviewResponseSchema,
  bulkSummaryBodySchema,
  bulkSummaryResponseSchema,
  latestBulkRevisionSchema,
  employeeDetailSchema,
  employeeExportQuerySchema,
  employeeFacetsQuerySchema,
  employeeFacetsResponseSchema,
  employeeIdParamsSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
  newEmployeeSchema,
  peerContextSchema,
  salaryChangePreviewBodySchema,
  salaryChangePreviewSchema,
  salaryChangeSchema,
  updateEmployeeSchema,
} from '@acme/shared';
import { Readable } from 'node:stream';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import {
  createEmployee,
  deactivateEmployee,
  reactivateEmployee,
  updateEmployee,
} from '../services/employees';
import {
  confirmBulkRevision,
  getLatestBulkRevision,
  previewBulkRevision,
  summariseBulkRevision,
} from '../services/bulk-revision';
import { previewSalaryChange } from '../services/salary-change-preview';
import { recordSalaryChange } from '../services/salary-changes';
import { exportEmployeesCsv } from '../services/employee-export';
import { getEmployeeDetail } from '../services/employee-detail';
import { getEmployeeFacets } from '../services/employee-facets';
import { listEmployees } from '../services/employee-list';
import { getPeerContext } from '../services/peer-groups';

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
      '/api/employees/bulk-salary-changes/summary',
      {
        schema: {
          body: bulkSummaryBodySchema,
          response: { 200: bulkSummaryResponseSchema },
        },
      },
      (request) => {
        const { filter, employeeIds, percentageBp, overrides } = request.body;
        const figures = {
          ...(percentageBp !== undefined ? { percentageBp } : {}),
          ...(overrides !== undefined ? { overrides } : {}),
        };
        return summariseBulkRevision(
          database.db,
          employeeIds !== undefined
            ? { employeeIds, ...figures }
            : { filter: filter ?? {}, ...figures },
        );
      },
    );

    app.get(
      '/api/employees/bulk-salary-changes/latest',
      { schema: { response: { 200: latestBulkRevisionSchema } } },
      () => getLatestBulkRevision(database.db),
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
      '/api/employees/export',
      { schema: { querystring: employeeExportQuerySchema } },
      (request, reply) => {
        const today = now().toISOString().slice(0, 10);
        return reply
          .type('text/csv; charset=utf-8')
          .header(
            'content-disposition',
            `attachment; filename="employees-${request.query.scope}-${today}.csv"`,
          )
          .send(Readable.from(exportEmployeesCsv(database.db, request.query)));
      },
    );

    app.get(
      '/api/employees/facets',
      {
        schema: {
          querystring: employeeFacetsQuerySchema,
          response: { 200: employeeFacetsResponseSchema },
        },
      },
      (request) => getEmployeeFacets(database.db, request.query),
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

    app.get(
      '/api/employees/:id/peer-context',
      {
        schema: {
          params: employeeIdParamsSchema,
          response: { 200: peerContextSchema },
        },
      },
      (request) => getPeerContext(database.db, request.params.id),
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
      '/api/employees/:id/salary-changes/preview',
      {
        schema: {
          params: employeeIdParamsSchema,
          body: salaryChangePreviewBodySchema,
          response: { 200: salaryChangePreviewSchema },
        },
      },
      (request) => previewSalaryChange(database.db, request.params.id, request.body),
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
