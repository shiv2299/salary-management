import {
  distributionQuerySchema,
  distributionResponseSchema,
  outliersResponseSchema,
  payrollQuerySchema,
  payrollResponseSchema,
  recentChangesQuerySchema,
  recentChangesResponseSchema,
} from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import { getDistribution, getOutliers, getPayroll } from '../services/insights';
import { getRecentChanges } from '../services/recent-changes';

export interface InsightRoutesDeps {
  database: Database;
  now: () => Date;
}

export const insightRoutes =
  ({ database, now }: InsightRoutesDeps): FastifyPluginAsyncZod =>
  (app) => {
    const { db } = database;

    app.get(
      '/api/insights/distribution',
      {
        schema: {
          querystring: distributionQuerySchema,
          response: { 200: distributionResponseSchema },
        },
      },
      ({ query }) => getDistribution(db, query.groupBy),
    );

    app.get(
      '/api/insights/payroll',
      { schema: { querystring: payrollQuerySchema, response: { 200: payrollResponseSchema } } },
      ({ query }) => getPayroll(db, query.groupBy),
    );

    app.get(
      '/api/insights/outliers',
      { schema: { response: { 200: outliersResponseSchema } } },
      () => getOutliers(db),
    );

    app.get(
      '/api/insights/recent-changes',
      {
        schema: {
          querystring: recentChangesQuerySchema,
          response: { 200: recentChangesResponseSchema },
        },
      },
      ({ query }) => getRecentChanges(db, { ...query, today: now().toISOString().slice(0, 10) }),
    );

    return Promise.resolve();
  };
