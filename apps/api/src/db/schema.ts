import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export const SALARY_REASONS = ['hire', 'raise', 'promotion', 'relocation', 'correction'] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export type SalaryReason = (typeof SALARY_REASONS)[number];

// Dates are ISO yyyy-mm-dd text; timestamps are ISO 8601 text. All money is integer minor units.

export const countries = sqliteTable('countries', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  currencyCode: text('currency_code').notNull(),
});

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const levels = sqliteTable('levels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  rank: integer('rank').notNull(),
});

export const fxRates = sqliteTable(
  'fx_rates',
  {
    currencyCode: text('currency_code').notNull(),
    asOfDate: text('as_of_date').notNull(),
    rateToBaseNano: integer('rate_to_base_nano').notNull(),
  },
  (t) => [primaryKey({ columns: [t.currencyCode, t.asOfDate] })],
);

export const employees = sqliteTable(
  'employees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull().unique(),
    countryCode: text('country_code')
      .notNull()
      .references(() => countries.code),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id),
    levelId: integer('level_id')
      .notNull()
      .references(() => levels.id),
    jobTitle: text('job_title').notNull(),
    hireDate: text('hire_date').notNull(),
    status: text('status', { enum: EMPLOYEE_STATUSES }).notNull().default('active'),
    /** The day the employee became inactive (yyyy-mm-dd); null while active. */
    deactivatedOn: text('deactivated_on'),
    currentAmountMinor: integer('current_amount_minor').notNull(),
    currentCurrencyCode: text('current_currency_code').notNull(),
    currentAmountBaseMinor: integer('current_amount_base_minor').notNull(),
    currentEffectiveDate: text('current_effective_date').notNull(),
    currentReason: text('current_reason', { enum: SALARY_REASONS }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('employees_status_amount_base_idx').on(t.status, t.currentAmountBaseMinor),
    index('employees_country_level_idx').on(t.countryCode, t.levelId),
    index('employees_department_idx').on(t.departmentId),
    index('employees_level_idx').on(t.levelId),
    index('employees_name_idx').on(t.lastName, t.firstName),
    index('employees_status_job_title_idx').on(t.status, t.jobTitle),
  ],
);

export const salaryRevisionBatches = sqliteTable('salary_revision_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: text('created_at').notNull(),
  effectiveDate: text('effective_date').notNull(),
  percentageBp: integer('percentage_bp').notNull(),
  employeeCount: integer('employee_count').notNull(),
  note: text('note'),
});

export const salaryHistory = sqliteTable(
  'salary_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id),
    amountMinor: integer('amount_minor').notNull(),
    currencyCode: text('currency_code').notNull(),
    effectiveDate: text('effective_date').notNull(),
    reason: text('reason', { enum: SALARY_REASONS }).notNull(),
    levelId: integer('level_id')
      .notNull()
      .references(() => levels.id),
    countryCode: text('country_code')
      .notNull()
      .references(() => countries.code),
    batchId: integer('batch_id').references(() => salaryRevisionBatches.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('salary_history_employee_date_idx').on(t.employeeId, t.effectiveDate, t.id),
    index('salary_history_effective_date_idx').on(t.effectiveDate),
    index('salary_history_batch_idx').on(t.batchId),
  ],
);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Level = typeof levels.$inferSelect;
export type NewLevel = typeof levels.$inferInsert;
export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type SalaryHistoryRow = typeof salaryHistory.$inferSelect;
export type NewSalaryHistoryRow = typeof salaryHistory.$inferInsert;
export type SalaryRevisionBatch = typeof salaryRevisionBatches.$inferSelect;
export type NewSalaryRevisionBatch = typeof salaryRevisionBatches.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
