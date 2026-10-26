import { z } from 'zod';

/** A real calendar date as `yyyy-mm-dd`. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date as yyyy-mm-dd')
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { message: 'must be a real calendar date' },
  );

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

/**
 * A filter that takes several values as `k=a&k=b`, `k=a,b` or both. Blank values are ignored and
 * a filter left with no values is treated as absent.
 */
function splitListParam(raw: unknown): unknown {
  if (raw === undefined) return undefined;
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((value: unknown) =>
    typeof value === 'string' ? value.split(',') : [value],
  );
  const values = parts.filter((part) => typeof part !== 'string' || part.trim() !== '');
  return values.length > 0 ? values : undefined;
}

/** The most values one list filter accepts. */
export const MAX_FILTER_VALUES = 100;

export function multiValueParam<T extends z.ZodType>(item: T) {
  return z.preprocess(splitListParam, z.array(item).min(1).max(MAX_FILTER_VALUES).optional());
}

/** The "needs attention" lists an employee can belong to. */
export const ATTENTION_VALUES = [
  'outlier-above',
  'outlier-below',
  'no-raise-2y',
  'compression',
] as const;
export const attentionSchema = z.enum(ATTENTION_VALUES);
export type Attention = z.infer<typeof attentionSchema>;

export const employeeListQuerySchema = z.object({
  country: multiValueParam(z.string().min(1)),
  department: multiValueParam(z.coerce.number().int().positive()),
  level: multiValueParam(z.coerce.number().int().positive()),
  attention: multiValueParam(attentionSchema),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  search: z.string().trim().min(1).optional(),
  sortBy: z
    .enum(['name', 'jobTitle', 'department', 'level', 'country', 'hireDate', 'salary'])
    .default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

/** The list's search, filters and sort, without paging, plus which rows to export. */
export const employeeExportQuerySchema = employeeListQuerySchema
  .omit({ limit: true, offset: true })
  .extend({ scope: z.enum(['filtered', 'all']) });

/** The list's search and filters, without sort or paging, for the filter options' counts. */
export const employeeFacetsQuerySchema = employeeListQuerySchema.omit({
  sortBy: true,
  sortOrder: true,
  limit: true,
  offset: true,
});

const facetCount = <T extends z.ZodType>(value: T) =>
  z.array(z.object({ value, count: z.number().int() }));

/**
 * How many employees each filter option would match. A group's counts apply the search and every
 * other group's selection but not its own; options nobody matches are left out, except the
 * attention values, which are always listed.
 */
export const employeeFacetsResponseSchema = z.object({
  /** Employees in the chosen status, before any other filter or search. */
  statusTotal: z.number().int(),
  status: facetCount(z.enum(['active', 'inactive'])),
  country: facetCount(z.string()),
  department: facetCount(z.number().int()),
  level: facetCount(z.number().int()),
  /** Always all four values, in `ATTENTION_VALUES` order, zero counts included. */
  attention: facetCount(attentionSchema),
});

export const employeeListItemSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  countryCode: z.string(),
  departmentId: z.number().int(),
  departmentName: z.string(),
  levelId: z.number().int(),
  levelCode: z.string(),
  jobTitle: z.string(),
  hireDate: z.string(),
  status: z.enum(['active', 'inactive']),
  salary: z.object({
    amountMinor: z.number().int(),
    currencyCode: z.string(),
    amountBaseMinor: z.number().int(),
    effectiveDate: z.string(),
  }),
});

export const employeeListResponseSchema = z.object({
  items: z.array(employeeListItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type EmployeeFacetsQuery = z.infer<typeof employeeFacetsQuerySchema>;
export type EmployeeFacets = z.infer<typeof employeeFacetsResponseSchema>;
export type EmployeeExportQueryParams = z.infer<typeof employeeExportQuerySchema>;
export type EmployeeListQueryParams = z.infer<typeof employeeListQuerySchema>;
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

const salaryHistoryReasonSchema = z.enum([
  'hire',
  'raise',
  'promotion',
  'relocation',
  'correction',
]);

export const salaryHistoryEntrySchema = z.object({
  id: z.number().int(),
  amountMinor: z.number().int(),
  currencyCode: z.string(),
  effectiveDate: z.string(),
  reason: salaryHistoryReasonSchema,
  levelId: z.number().int(),
  levelCode: z.string(),
  countryCode: z.string(),
  batchId: z.number().int().nullable(),
  createdAt: z.string(),
  /**
   * Change from the previous row by effective date, in basis points; null on the first row.
   * Compared in USD when the currency changed.
   */
  changeBp: z.number().int().nullable(),
  /** The amount in USD at the latest FX rates, converted by the server. */
  amountBaseMinor: z.number().int(),
});

/**
 * Figures over an employee's whole salary history. All amounts are in `currencyCode`: the rows'
 * own currency, or USD (`convertedToUsd`) when the pay moved between currencies.
 */
export const historySummarySchema = z.object({
  currencyCode: z.string(),
  convertedToUsd: z.boolean(),
  hireAmountMinor: z.number().int(),
  currentAmountMinor: z.number().int(),
  /** Null with only the hire row. */
  sinceHireBp: z.number().int().nullable(),
  /** Compound yearly growth; null under a year of history. */
  averageYearlyGrowthBp: z.number().int().nullable(),
  biggestJump: z
    .object({
      historyId: z.number().int(),
      changeBp: z.number().int(),
      effectiveDate: z.string(),
      reason: salaryHistoryReasonSchema,
    })
    .nullable(),
  promotionCount: z.number().int(),
  raiseCount: z.number().int(),
});

export const employeeDetailSchema = employeeListItemSchema.extend({
  deactivatedOn: z.string().nullable(),
  history: z.array(salaryHistoryEntrySchema),
  historySummary: historySummarySchema,
});

export const employeeIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Where an employee's pay sits among active peers of the same country and level. The typical
 * range is in the group's local currency; `typical` and `position` are null when the group has
 * too few active members to judge.
 */
export const peerContextSchema = z.object({
  countryCode: z.string(),
  levelId: z.number().int(),
  levelCode: z.string(),
  currencyCode: z.string(),
  headcount: z.number().int(),
  typical: z
    .object({ p25: z.number().int(), median: z.number().int(), p75: z.number().int() })
    .nullable(),
  position: z
    .object({
      typical: z.enum(['below', 'inside', 'above']),
      outlier: z.enum(['below', 'above']).nullable(),
    })
    .nullable(),
});

export type PeerContext = z.infer<typeof peerContextSchema>;
export type HistorySummary = z.infer<typeof historySummarySchema>;
export type SalaryHistoryEntry = z.infer<typeof salaryHistoryEntrySchema>;
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

const personName = z.string().trim().min(1).max(100);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const newEmployeeSchema = z.object({
  firstName: personName,
  lastName: personName,
  email: emailSchema,
  countryCode: z.string().min(1),
  departmentId: z.number().int().positive(),
  levelId: z.number().int().positive(),
  jobTitle: z.string().trim().min(1).max(100),
  hireDate: isoDateSchema,
  /** Initial annual salary in the minor units of the country's currency. */
  amountMinor: z.number().int().positive(),
});

export type NewEmployeeBody = z.infer<typeof newEmployeeSchema>;

/**
 * Country, level and salary are deliberately absent and the schema is strict, so a request that
 * tries to change them is rejected: they change only through a salary change.
 */
export const updateEmployeeSchema = newEmployeeSchema
  .pick({ firstName: true, lastName: true, email: true, departmentId: true, jobTitle: true })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'at least one field is required' });

export type UpdateEmployeeBody = z.infer<typeof updateEmployeeSchema>;

/** Hire rows are created only with the employee, so `hire` is not an accepted reason here. */
export const salaryChangeSchema = z
  .object({
    reason: z.enum(['raise', 'promotion', 'relocation', 'correction']),
    effectiveDate: isoDateSchema,
    /** In the minor units of the currency the employee is paid in from this change on. */
    amountMinor: z.number().int().positive(),
    newLevelId: z.number().int().positive().optional(),
    newCountryCode: z.string().min(1).optional(),
  })
  .strict();

export type SalaryChangeBody = z.infer<typeof salaryChangeSchema>;

const salaryChangeReasonSchema = z.enum(['raise', 'promotion', 'relocation', 'correction']);

/**
 * A proposed change, for a preview only: no effective date, and either an amount or a percentage
 * of the current salary. Business rules are checked when the change is submitted, not here.
 */
export const salaryChangePreviewBodySchema = z
  .object({
    reason: salaryChangeReasonSchema,
    /** In the minor units of the currency the employee would be paid in. */
    amountMinor: z.number().int().positive().optional(),
    /** An increase on the current salary, 1 to 10,000 basis points. */
    percentageBp: z.number().int().min(1).max(10_000).optional(),
    newLevelId: z.number().int().positive().optional(),
    newCountryCode: z.string().min(1).optional(),
  })
  .strict()
  .refine((body) => (body.amountMinor === undefined) !== (body.percentageBp === undefined), {
    message: 'provide exactly one of amountMinor or percentageBp',
  })
  .refine((body) => !(body.reason === 'relocation' && body.percentageBp !== undefined), {
    message: 'a relocation takes an amount, not a percentage',
  });

const moneySchema = z.object({
  amountMinor: z.number().int(),
  currencyCode: z.string(),
  amountBaseMinor: z.number().int(),
});

/**
 * The proposed salary next to the current one. `changeBp` is compared in local amounts when the
 * currency stays the same and in USD when it changes; `changeBaseMinor` is always USD. `peer` places
 * the proposed amount against the peers of the target country and level.
 */
export const salaryChangePreviewSchema = z.object({
  current: moneySchema,
  proposed: moneySchema,
  changeBaseMinor: z.number().int(),
  changeBp: z.number().int(),
  peer: peerContextSchema,
});

export type SalaryChangePreviewBody = z.infer<typeof salaryChangePreviewBodySchema>;
export type SalaryChangePreview = z.infer<typeof salaryChangePreviewSchema>;
