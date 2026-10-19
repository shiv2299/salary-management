import {
  countrySchema,
  departmentSchema,
  fxConvertQuerySchema,
  fxConvertResponseSchema,
  fxRatesSchema,
  levelSchema,
} from '@acme/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client';
import {
  convertAmount,
  getCountries,
  getDepartments,
  getFxRates,
  getLevels,
} from '../services/reference';

export const referenceRoutes =
  (database: Database): FastifyPluginAsyncZod =>
  (app) => {
    const { db } = database;

    app.get(
      '/api/reference/countries',
      { schema: { response: { 200: z.array(countrySchema) } } },
      () => getCountries(db),
    );
    app.get(
      '/api/reference/departments',
      { schema: { response: { 200: z.array(departmentSchema) } } },
      () => getDepartments(db),
    );
    app.get('/api/reference/levels', { schema: { response: { 200: z.array(levelSchema) } } }, () =>
      getLevels(db),
    );
    app.get('/api/reference/fx-rates', { schema: { response: { 200: fxRatesSchema } } }, () =>
      getFxRates(db),
    );

    app.get(
      '/api/reference/fx/convert',
      {
        schema: {
          querystring: fxConvertQuerySchema,
          response: { 200: fxConvertResponseSchema },
        },
      },
      ({ query }) => convertAmount(db, query.amountMinor, query.from, query.to),
    );

    return Promise.resolve();
  };
