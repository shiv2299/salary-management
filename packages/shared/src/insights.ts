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

export const PAYROLL_CAUSES = [
  'hires',
  'raises',
  'promotions',
  'relocations',
  'corrections',
  'leavers',
] as const;

const groupTotalSchema = z.object({
  key: z.string(),
  label: z.string(),
  headcount: z.number().int(),
  totalBaseMinor: z.number().int(),
});

export const payrollTrendResponseSchema = z.object({
  baseCurrency: baseCurrencySchema,
  asOf: z.string(),
  points: z.array(
    z.object({
      /** yyyy-12-31, or today for the last point. */
      date: z.string(),
      year: z.number().int(),
      isToday: z.boolean(),
      headcount: z.number().int(),
      totalBaseMinor: z.number().int(),
      byCountry: z.array(groupTotalSchema),
      byDepartment: z.array(groupTotalSchema),
    }),
  ),
  summary: z.object({
    totalBaseMinor: z.number().int(),
    yearAgoTotalBaseMinor: z.number().int(),
    /** Null when there was no payroll a year ago. */
    changeBp: z.number().int().nullable(),
    headcount: z.number().int(),
    yearAgoHeadcount: z.number().int(),
  }),
});

export const payrollChangeResponseSchema = z.object({
  baseCurrency: baseCurrencySchema,
  /** A year ago (exclusive) and today. */
  from: z.string(),
  to: z.string(),
  fromTotalBaseMinor: z.number().int(),
  toTotalBaseMinor: z.number().int(),
  changeBaseMinor: z.number().int(),
  /** All six, in PAYROLL_CAUSES order. */
  causes: z.array(
    z.object({
      cause: z.enum(PAYROLL_CAUSES),
      amountBaseMinor: z.number().int(),
      count: z.number().int(),
    }),
  ),
  /** The cause with the largest positive amount (the earlier in PAYROLL_CAUSES on a tie); null when none is positive. */
  largestAddition: z.enum(PAYROLL_CAUSES).nullable(),
});

export const increaseStatsSchema = z.object({
  raiseCount: z.number().int(),
  averageRaiseBp: z.number().int().nullable(),
  raisesAddedBaseMinor: z.number().int(),
  promotionCount: z.number().int(),
  promotionsAddedBaseMinor: z.number().int(),
  totalAddedBaseMinor: z.number().int(),
});

const groupIncreaseStatsSchema = increaseStatsSchema.extend({
  key: z.string(),
  label: z.string(),
});

export const raiseStatsResponseSchema = z.object({
  baseCurrency: baseCurrencySchema,
  asOf: z.string(),
  years: z.array(
    z.object({
      year: z.number().int(),
      yearToDate: z.boolean(),
      all: increaseStatsSchema,
      byCountry: z.array(groupIncreaseStatsSchema),
      byDepartment: z.array(groupIncreaseStatsSchema),
    }),
  ),
  trailing: z.object({
    current: increaseStatsSchema.extend({ after: z.string(), through: z.string() }),
    previous: increaseStatsSchema.extend({ after: z.string(), through: z.string() }),
  }),
});

export const attentionResponseSchema = z.object({
  asOf: z.string(),
  activeHeadcount: z.number().int(),
  outlierAbove: z.number().int(),
  outlierBelow: z.number().int(),
  /** (above + below) ÷ active headcount, in bp; 0 with no one active. */
  outsidePeerRangeShareBp: z.number().int(),
  noRaise2y: z.number().int(),
  compression: z.object({
    /** Long-tenured people in the flagged groups. */
    peopleCount: z.number().int(),
    groups: z.array(
      z.object({
        countryCode: z.string(),
        countryName: z.string(),
        levelId: z.number().int(),
        levelCode: z.string(),
        recentCount: z.number().int(),
        tenuredCount: z.number().int(),
        recentMedianBaseMinor: z.number().int(),
        tenuredMedianBaseMinor: z.number().int(),
        gapBp: z.number().int(),
      }),
    ),
  }),
});

export type DistributionResponse = z.infer<typeof distributionResponseSchema>;
export type PayrollResponse = z.infer<typeof payrollResponseSchema>;
export type OutliersResponse = z.infer<typeof outliersResponseSchema>;
export type RecentChangeEntry = z.infer<typeof recentChangeEntrySchema>;
export type RecentChangesResponse = z.infer<typeof recentChangesResponseSchema>;
export type PayrollTrendResponse = z.infer<typeof payrollTrendResponseSchema>;
export type PayrollChangeResponse = z.infer<typeof payrollChangeResponseSchema>;
export type IncreaseStats = z.infer<typeof increaseStatsSchema>;
export type RaiseStatsResponse = z.infer<typeof raiseStatsResponseSchema>;
export type AttentionResponse = z.infer<typeof attentionResponseSchema>;
