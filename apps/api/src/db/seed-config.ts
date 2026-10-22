import type { FxRates } from '../domain/fx';

// ---- Reference data -------------------------------------------------------------------------

export const COUNTRIES = [
  { code: 'IN', name: 'India', currencyCode: 'INR', share: 45 },
  { code: 'US', name: 'United States', currencyCode: 'USD', share: 35 },
  { code: 'DE', name: 'Germany', currencyCode: 'EUR', share: 20 },
] as const;

export const DEPARTMENTS = [
  {
    name: 'Engineering',
    share: 35,
    payFactor: 1.06,
    roles: ['Software Engineer', 'QA Engineer', 'DevOps Engineer', 'Data Engineer'],
  },
  {
    name: 'Sales',
    share: 18,
    payFactor: 1.02,
    roles: ['Account Executive', 'Sales Development Rep', 'Solutions Consultant'],
  },
  {
    name: 'Marketing',
    share: 8,
    payFactor: 1,
    roles: ['Content Strategist', 'Growth Marketer', 'Brand Designer'],
  },
  {
    name: 'Finance',
    share: 8,
    payFactor: 1,
    roles: ['Financial Analyst', 'Accountant', 'Payroll Specialist'],
  },
  {
    name: 'People/HR',
    share: 5,
    payFactor: 0.98,
    roles: ['Recruiter', 'HR Business Partner', 'People Operations Specialist'],
  },
  {
    name: 'Support',
    share: 14,
    payFactor: 0.92,
    roles: ['Support Specialist', 'Customer Success Manager', 'Technical Support Engineer'],
  },
  {
    name: 'Operations',
    share: 12,
    payFactor: 0.95,
    roles: ['Operations Analyst', 'Program Manager', 'Logistics Coordinator'],
  },
] as const;

export const LEVELS = [
  { code: 'L1', label: 'Entry', rank: 1, share: 24 },
  { code: 'L2', label: 'Associate', rank: 2, share: 28 },
  { code: 'L3', label: 'Senior', rank: 3, share: 22 },
  { code: 'L4', label: 'Lead', rank: 4, share: 14 },
  { code: 'L5', label: 'Principal', rank: 5, share: 8 },
  { code: 'L6', label: 'Director', rank: 6, share: 4 },
] as const;

/** Fixed, dated rates: the value of one major unit in USD times 10^9. */
export const FX_AS_OF_DATE = '2026-01-01';
export const FX_RATES: FxRates = { INR: 11_980_000, EUR: 1_080_000_000 };

/**
 * A new hire's annual pay in whole major units of each country's currency at each level today,
 * by level rank 1..6. India's steps are about 1.35x, like the other countries', so a 10-20%
 * promotion lands inside the next level's band instead of below it.
 */
export const ENTRY_PAY_MAJOR: Record<string, readonly number[]> = {
  IN: [800_000, 1_080_000, 1_450_000, 1_950_000, 2_600_000, 3_500_000],
  US: [70_000, 90_000, 120_000, 155_000, 195_000, 250_000],
  DE: [42_000, 55_000, 70_000, 88_000, 110_000, 145_000],
};

// ---- Generation knobs -----------------------------------------------------------------------

export const HIRE_SPAN_DAYS = 3650;
export const EVENT_BLOCK_DAYS = 1825;
export const CYCLE_COUNT = 10;
export const FIRST_CYCLE_DAYS_BEFORE_REFERENCE = 60;
export const PAY_SIGMA = 0.12;
export const OUTLIER_SHARE = 0.011;
export const INACTIVE_SHARE = 0.04;
export const MIN_TENURE_FOR_CYCLE_DAYS = 180;
export const MIN_QUIET_DAYS_BEFORE_CYCLE = 120;
export const MIN_TENURE_FOR_CHANGE_DAYS = 180;
export const MEAN_CYCLE_BP = 450;
/** Entry pay for a level grows this much a year (tunable 200-350). */
export const MARKET_GROWTH_BP = 300;
/** A promotion raises pay by a draw from this range, in basis points. */
export const PROMOTION_UPLIFT_BP = { min: 1000, max: 2000 } as const;
/** Share of active employees (3+ years' tenure) who get no change from 2-3 years before the reference date. */
export const SKIPPED_RAISE_SHARE = 0.04;
export const SKIP_MIN_TENURE_DAYS = 1100;
export const SKIP_START_DAYS = { min: 760, max: 1095 } as const;
/** Hires this recent in these country + level-rank groups come in above long-tenured staff. */
export const COMPRESSION_GROUPS = [
  { countryCode: 'IN', rank: 2 },
  { countryCode: 'IN', rank: 3 },
  { countryCode: 'US', rank: 2 },
] as const;
export const RECENT_HIRE_DAYS = 365;
/** A recent hire in a compression group is paid this multiple of the market rate (tunable 1.15-1.3). */
export const COMPRESSION_PREMIUM = 1.2;
export const HIRE_BATCH_SIZE = 1000;
export const WRITE_BATCH_SIZE = 1000;

export const INDIVIDUAL_EVENT_COUNT_WEIGHTS = [55, 30, 12, 3];
export const INDIVIDUAL_EVENT_KINDS = ['raise', 'promotion', 'relocation'] as const;
export const INDIVIDUAL_EVENT_KIND_WEIGHTS = [71, 25, 4];
