import type {
  EmployeeDetail,
  EmployeeFacets,
  EmployeeListItem,
  PeerContext,
  SalaryChangePreview,
} from '@acme/shared';

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
        changeBp: 1111,
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
        changeBp: null,
      },
    ],
    ...overrides,
  };
}

export function peerContext(overrides: Partial<PeerContext> = {}): PeerContext {
  return {
    countryCode: 'IN',
    levelId: 3,
    levelCode: 'L3',
    currencyCode: 'INR',
    headcount: 214,
    typical: { p25: 400_000_000, median: 450_000_000, p75: 520_000_000 },
    position: { typical: 'inside', outlier: null },
    ...overrides,
  };
}

export function salaryPreview(overrides: Partial<SalaryChangePreview> = {}): SalaryChangePreview {
  return {
    current: { amountMinor: 500_000_000, currencyCode: 'INR', amountBaseMinor: 5_990_000 },
    proposed: { amountMinor: 550_000_000, currencyCode: 'INR', amountBaseMinor: 6_589_000 },
    changeBaseMinor: 599_000,
    changeBp: 1000,
    peer: peerContext(),
    ...overrides,
  };
}

export function employeeFacets(overrides: Partial<EmployeeFacets> = {}): EmployeeFacets {
  return {
    statusTotal: 9577,
    status: [
      { value: 'active', count: 9577 },
      { value: 'inactive', count: 423 },
    ],
    country: [
      { value: 'IN', count: 6000 },
      { value: 'DE', count: 2000 },
      { value: 'US', count: 1577 },
    ],
    department: [
      { value: 1, count: 5000 },
      { value: 2, count: 4577 },
    ],
    level: [
      { value: 1, count: 3000 },
      { value: 2, count: 3000 },
      { value: 3, count: 2500 },
      { value: 4, count: 1077 },
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
