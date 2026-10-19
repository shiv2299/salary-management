import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client';
import { getCountries, getDepartments, getFxRates, getLevels } from '../services/reference';

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

    return Promise.resolve();
  };
