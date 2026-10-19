import { z } from 'zod';

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
