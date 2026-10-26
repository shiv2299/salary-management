import {
  attentionResponseSchema,
  distributionQuerySchema,
  distributionResponseSchema,
  levelBandsQuerySchema,
  levelBandsResponseSchema,
  payrollChangeResponseSchema,
  payrollTrendResponseSchema,
  raiseStatsResponseSchema,
  recentChangesQuerySchema,
  recentChangesResponseSchema,
} from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Database } from '../db/client';
import { getAttention } from '../services/attention';
import { getDistribution } from '../services/insights';
import { getPayrollChange, getPayrollTrend, getRaiseStats } from '../services/insights-history';
import { getLevelBands } from '../services/level-bands';
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
      '/api/insights/recent-changes',
      {
        schema: {
          querystring: recentChangesQuerySchema,
          response: { 200: recentChangesResponseSchema },
        },
      },
      ({ query }) => getRecentChanges(db, { ...query, today: now().toISOString().slice(0, 10) }),
    );

    const today = () => now().toISOString().slice(0, 10);

    app.get(
      '/api/insights/payroll-trend',
      { schema: { response: { 200: payrollTrendResponseSchema } } },
      () => getPayrollTrend(db, today()),
    );

    app.get(
      '/api/insights/payroll-change',
      { schema: { response: { 200: payrollChangeResponseSchema } } },
      () => getPayrollChange(db, today()),
    );

    app.get(
      '/api/insights/raises',
      { schema: { response: { 200: raiseStatsResponseSchema } } },
      () => getRaiseStats(db, today()),
    );

    app.get(
      '/api/insights/attention',
      { schema: { response: { 200: attentionResponseSchema } } },
      () => getAttention(db, today()),
    );

    app.get(
      '/api/insights/level-bands',
      {
        schema: { querystring: levelBandsQuerySchema, response: { 200: levelBandsResponseSchema } },
      },
      ({ query }) => getLevelBands(db, query.country),
    );

    return Promise.resolve();
  };
