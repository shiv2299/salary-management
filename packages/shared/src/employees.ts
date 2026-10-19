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

export const employeeListQuerySchema = z.object({
  country: z.string().min(1).optional(),
  department: z.coerce.number().int().positive().optional(),
  level: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  search: z.string().trim().min(1).optional(),
  sortBy: z.enum(['name', 'salary', 'hireDate']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
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

export type EmployeeListQueryParams = z.infer<typeof employeeListQuerySchema>;
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

export const salaryHistoryEntrySchema = z.object({
  id: z.number().int(),
  amountMinor: z.number().int(),
  currencyCode: z.string(),
  effectiveDate: z.string(),
  reason: z.enum(['hire', 'raise', 'promotion', 'relocation', 'correction']),
  levelId: z.number().int(),
  levelCode: z.string(),
  countryCode: z.string(),
  batchId: z.number().int().nullable(),
  createdAt: z.string(),
});

export const employeeDetailSchema = employeeListItemSchema.extend({
  history: z.array(salaryHistoryEntrySchema),
});

export const employeeIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

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
