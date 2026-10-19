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

const countrySchema = z.object({ code: z.string(), name: z.string(), currencyCode: z.string() });
const departmentSchema = z.object({ id: z.number().int(), name: z.string() });
const levelSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  label: z.string(),
  rank: z.number().int(),
});
const fxRatesSchema = z.object({
  baseCurrency: z.string(),
  rates: z.array(
    z.object({
      currencyCode: z.string(),
      asOfDate: z.string(),
      rateToBaseNano: z.number().int(),
    }),
  ),
});

const convertQuerySchema = z.object({
  amountMinor: z.coerce.number().int().min(0),
  from: z.string().length(3),
  to: z.string().length(3),
});

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
          querystring: convertQuerySchema,
          response: { 200: z.object({ amountMinor: z.number().int(), currencyCode: z.string() }) },
        },
      },
      ({ query }) => convertAmount(db, query.amountMinor, query.from, query.to),
    );

    return Promise.resolve();
  };
