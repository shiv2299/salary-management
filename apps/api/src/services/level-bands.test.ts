import { levelBandsResponseSchema } from '@acme/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getLevelBands } from './level-bands';
import { applySalaryChanges } from './salary-writer';

const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;
let emailSequence = 0;

beforeEach(() => {
  database = createTestDb();
  emailSequence = 0;
});

function add(overrides: Partial<NewEmployeeInput> = {}): number {
  const [id] = createEmployees(
    database.db,
    [
      {
        firstName: 'Asha',
        lastName: 'Rao',
        email: `person${++emailSequence}@acme.test`,
        countryCode: 'IN',
        departmentId: 1,
        levelId: 1,
        jobTitle: 'Engineer',
        hireDate: '2025-06-01',
        amountMinor: 1_000_000,
        ...overrides,
      },
    ],
    deps,
  );
  return id!;
}

describe('getLevelBands', () => {
  it("reads the country's active employees in its own currency", () => {
    for (let i = 0; i < 10; i++) add({ amountMinor: 1_000_000 + i * 10_000 });
    const relocated = add({ countryCode: 'US', amountMinor: 5_000_000 });
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: relocated,
          reason: 'relocation',
          amountMinor: 9_000_000,
          currencyCode: 'USD',
          countryCode: 'IN',
          effectiveDate: '2025-07-01',
        },
      ],
      deps,
    );

    const result = getLevelBands(database.db, 'IN');

    levelBandsResponseSchema.parse(result);
    expect(result).toMatchObject({ countryCode: 'IN', currencyCode: 'INR' });
    const l1 = result.levels.find((l) => l.levelId === 1)!;
    expect(l1.headcount).toBe(11);
    expect(l1.typical).toEqual({ p25: 1_022_500, median: 1_045_000, p75: 1_067_500 });
  });

  it('rejects an unknown country', () => {
    expect(() => getLevelBands(database.db, 'ZZ')).toThrow(
      expect.objectContaining({ statusCode: 404, code: 'COUNTRY_NOT_FOUND' }) as Error,
    );
  });
});
