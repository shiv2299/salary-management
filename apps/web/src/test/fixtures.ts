import type { EmployeeDetail, EmployeeListItem } from '@acme/shared';

export function employeeItem(overrides: Partial<EmployeeListItem> = {}): EmployeeListItem {
  return {
    id: 1,
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha.rao@acme.test',
    countryCode: 'IN',
    departmentId: 1,
    departmentName: 'Engineering',
    levelId: 3,
    levelCode: 'L3',
    jobTitle: 'Software Engineer',
    hireDate: '2021-04-12',
    status: 'active',
    salary: {
      amountMinor: 500_000_000,
      currencyCode: 'INR',
      amountBaseMinor: 5_990_000,
      effectiveDate: '2025-04-01',
    },
    ...overrides,
  };
}

export function employeeDetail(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    ...employeeItem(),
    history: [
      {
        id: 2,
        amountMinor: 500_000_000,
        currencyCode: 'INR',
        effectiveDate: '2025-04-01',
        reason: 'raise',
        levelId: 3,
        levelCode: 'L3',
        countryCode: 'IN',
        batchId: null,
        createdAt: '2025-04-01T09:00:00.000Z',
      },
      {
        id: 1,
        amountMinor: 450_000_000,
        currencyCode: 'INR',
        effectiveDate: '2021-04-12',
        reason: 'hire',
        levelId: 3,
        levelCode: 'L3',
        countryCode: 'IN',
        batchId: null,
        createdAt: '2021-04-12T09:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

export const REFERENCE_ROUTES = {
  'GET /api/reference/countries': [
    { code: 'IN', name: 'India', currencyCode: 'INR' },
    { code: 'US', name: 'United States', currencyCode: 'USD' },
    { code: 'DE', name: 'Germany', currencyCode: 'EUR' },
  ],
  'GET /api/reference/departments': [
    { id: 1, name: 'Engineering' },
    { id: 2, name: 'Sales' },
  ],
  'GET /api/reference/levels': [
    { id: 1, code: 'L1', label: 'Junior', rank: 1 },
    { id: 2, code: 'L2', label: 'Mid', rank: 2 },
    { id: 3, code: 'L3', label: 'Senior', rank: 3 },
    { id: 4, code: 'L4', label: 'Lead', rank: 4 },
  ],
  'GET /api/reference/fx-rates': {
    baseCurrency: 'USD',
    rates: [
      { currencyCode: 'INR', asOfDate: '2026-01-15', rateToBaseNano: 11_980_000 },
      { currencyCode: 'EUR', asOfDate: '2026-01-15', rateToBaseNano: 1_080_000_000 },
      { currencyCode: 'USD', asOfDate: '2026-01-15', rateToBaseNano: 1_000_000_000 },
    ],
  },
};
