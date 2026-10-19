import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './employees';

const baseCurrencySchema = z.string();

export const distributionQuerySchema = z.object({
  groupBy: z.enum(['country', 'department', 'level']),
});

export const payrollQuerySchema = z.object({
  groupBy: z.enum(['country', 'department']),
});

export const recentChangesQuerySchema = z.object({
  years: z.coerce
    .number()
    .pipe(z.union([z.literal(3), z.literal(5)]))
    .default(3),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export const distributionSchema = z.object({
  headcount: z.number().int(),
  min: z.number().int(),
  max: z.number().int(),
  mean: z.number().int(),
  median: z.number().int(),
  p25: z.number().int(),
  p75: z.number().int(),
  p90: z.number().int(),
});

export const distributionResponseSchema = z.object({
  baseCurrency: baseCurrencySchema,
  groupBy: distributionQuerySchema.shape.groupBy,
  groups: z.array(
    z.object({ key: z.string(), label: z.string(), distribution: distributionSchema }),
  ),
});

export const payrollResponseSchema = z.object({
  baseCurrency: baseCurrencySchema,
  groupBy: payrollQuerySchema.shape.groupBy,
  headcount: z.number().int(),
  totalBaseMinor: z.number().int(),
  groups: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      headcount: z.number().int(),
      totalBaseMinor: z.number().int(),
    }),
  ),
});

export const outlierSchema = z.object({
  employeeId: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  countryCode: z.string(),
  departmentName: z.string(),
  levelCode: z.string(),
  jobTitle: z.string(),
  salary: z.object({
    amountMinor: z.number().int(),
    currencyCode: z.string(),
    amountBaseMinor: z.number().int(),
  }),
  direction: z.enum(['above', 'below']),
  peerGroup: z.object({
    headcount: z.number().int(),
    p25: z.number().int(),
    median: z.number().int(),
    p75: z.number().int(),
    lowerFence: z.number().int(),
    upperFence: z.number().int(),
  }),
});

export const outliersResponseSchema = z.object({
  baseCurrency: baseCurrencySchema,
  total: z.number().int(),
  items: z.array(outlierSchema),
});

const moneySchema = z.object({ amountMinor: z.number().int(), currencyCode: z.string() });

export const recentChangeEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('individual'),
    historyId: z.number().int(),
    effectiveDate: z.string(),
    reason: z.enum(['hire', 'raise', 'promotion', 'relocation', 'correction']),
    employee: z.object({
      id: z.number().int(),
      firstName: z.string(),
      lastName: z.string(),
      countryCode: z.string(),
      status: z.enum(['active', 'inactive']),
    }),
    from: moneySchema.nullable(),
    to: moneySchema,
  }),
  z.object({
    kind: z.literal('batch'),
    batchId: z.number().int(),
    effectiveDate: z.string(),
    headcount: z.number().int(),
    percentageBp: z.number().int(),
    note: z.string().nullable(),
  }),
]);

export const recentChangesResponseSchema = z.object({
  years: z.union([z.literal(3), z.literal(5)]),
  windowStart: z.string(),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  items: z.array(recentChangeEntrySchema),
});

export type DistributionResponse = z.infer<typeof distributionResponseSchema>;
export type PayrollResponse = z.infer<typeof payrollResponseSchema>;
export type OutliersResponse = z.infer<typeof outliersResponseSchema>;
export type RecentChangeEntry = z.infer<typeof recentChangeEntrySchema>;
export type RecentChangesResponse = z.infer<typeof recentChangesResponseSchema>;
