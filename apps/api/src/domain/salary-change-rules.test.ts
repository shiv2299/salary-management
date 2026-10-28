import { describe, expect, it } from 'vitest';
import { validateSalaryChange } from './salary-change-rules';

const context = {
  today: '2025-06-01',
  hireDate: '2020-03-01',
  status: 'active' as const,
  amountInForceMinor: 100000,
  currentCountryCode: 'IN',
  currentLevelRank: 3,
};

const validRaise = {
  reason: 'raise' as const,
  effectiveDate: '2025-05-01',
  amountMinor: 110000,
};

describe('validateSalaryChange: all reasons', () => {
  it('accepts a change dated today', () => {
    expect(validateSalaryChange({ ...validRaise, effectiveDate: '2025-06-01' }, context)).toEqual(
      [],
    );
  });

  it('rejects a change dated after today', () => {
    expect(validateSalaryChange({ ...validRaise, effectiveDate: '2025-06-02' }, context)).toEqual([
      'effective date must not be in the future',
    ]);
  });

  it('accepts a change dated on the hire date', () => {
    expect(validateSalaryChange({ ...validRaise, effectiveDate: '2020-03-01' }, context)).toEqual(
      [],
    );
  });

  it('rejects a change dated before the hire date', () => {
    expect(validateSalaryChange({ ...validRaise, effectiveDate: '2020-02-29' }, context)).toEqual([
      'effective date must not be before the hire date',
    ]);
  });

  it('accepts a change for an active employee', () => {
    expect(validateSalaryChange(validRaise, { ...context, status: 'active' })).toEqual([]);
  });

  it('rejects a change for an inactive employee', () => {
    expect(validateSalaryChange(validRaise, { ...context, status: 'inactive' })).toEqual([
      'employee must be active',
    ]);
  });

  it('accepts a positive amount', () => {
    expect(
      validateSalaryChange({ ...validRaise, reason: 'correction', amountMinor: 1 }, context),
    ).toEqual([]);
  });

  it('rejects a zero amount', () => {
    expect(
      validateSalaryChange({ ...validRaise, reason: 'correction', amountMinor: 0 }, context),
    ).toEqual(['amount must be greater than zero']);
  });
});

describe('validateSalaryChange: raise', () => {
  it('accepts an amount above the amount in force with no level or country change', () => {
    expect(validateSalaryChange(validRaise, context)).toEqual([]);
  });

  it('rejects an amount equal to the amount in force', () => {
    expect(validateSalaryChange({ ...validRaise, amountMinor: 100000 }, context)).toEqual([
      'a raise must increase the amount in force on its effective date',
    ]);
  });

  it('rejects a raise that carries a new level or country', () => {
    expect(validateSalaryChange({ ...validRaise, newLevelId: 5 }, context)).toEqual([
      'a raise cannot change level or country',
    ]);
  });
});

describe('validateSalaryChange: promotion', () => {
  const promotion = {
    reason: 'promotion' as const,
    effectiveDate: '2025-05-01',
    amountMinor: 150000,
    newLevelId: 5,
  };

  it('accepts a promotion to a higher level rank', () => {
    expect(validateSalaryChange(promotion, { ...context, newLevelRank: 4 })).toEqual([]);
  });

  it('accepts a promotion that keeps the amount in force', () => {
    expect(
      validateSalaryChange({ ...promotion, amountMinor: 100000 }, { ...context, newLevelRank: 4 }),
    ).toEqual([]);
  });

  it('rejects a promotion that lowers the amount in force', () => {
    expect(
      validateSalaryChange({ ...promotion, amountMinor: 99999 }, { ...context, newLevelRank: 4 }),
    ).toEqual(['a promotion must not lower the amount in force on its effective date']);
  });

  it('rejects a promotion with no new level', () => {
    expect(validateSalaryChange({ ...promotion, newLevelId: undefined }, context)).toEqual([
      'a promotion requires a new level',
    ]);
  });

  it('rejects a promotion to a level that does not rank higher', () => {
    expect(validateSalaryChange(promotion, { ...context, newLevelRank: 3 })).toEqual([
      'a promotion must move to a higher level rank',
    ]);
  });
});

describe('validateSalaryChange: relocation', () => {
  const relocation = {
    reason: 'relocation' as const,
    effectiveDate: '2025-05-01',
    amountMinor: 120000,
    newCountryCode: 'US',
  };

  it('accepts a relocation to a different country', () => {
    expect(validateSalaryChange(relocation, context)).toEqual([]);
  });

  it('rejects a relocation with no new country', () => {
    expect(validateSalaryChange({ ...relocation, newCountryCode: undefined }, context)).toEqual([
      'a relocation requires a new country',
    ]);
  });

  it('rejects a relocation to the current country', () => {
    expect(validateSalaryChange({ ...relocation, newCountryCode: 'IN' }, context)).toEqual([
      'a relocation must move to a different country',
    ]);
  });
});

describe('validateSalaryChange: correction', () => {
  it('accepts a correction to an amount lower than the current amount', () => {
    expect(
      validateSalaryChange(
        { reason: 'correction', effectiveDate: '2025-05-01', amountMinor: 90000 },
        context,
      ),
    ).toEqual([]);
  });

  it('accepts a correction that also fixes the level', () => {
    expect(
      validateSalaryChange(
        {
          reason: 'correction',
          effectiveDate: '2025-05-01',
          amountMinor: 90000,
          newLevelId: 2,
        },
        { ...context, newLevelRank: 2 },
      ),
    ).toEqual([]);
  });
});

describe('validateSalaryChange: hire', () => {
  it('rejects a hire row because hire rows are created only with the employee', () => {
    expect(
      validateSalaryChange(
        { reason: 'hire', effectiveDate: '2020-03-01', amountMinor: 100000 },
        context,
      ),
    ).toEqual(['hire rows are created only with the employee']);
  });
});

describe('validateSalaryChange: only the matching reason moves country or level', () => {
  it('rejects a promotion that also moves the country', () => {
    expect(
      validateSalaryChange(
        {
          reason: 'promotion',
          effectiveDate: '2025-05-01',
          amountMinor: 120000,
          newLevelId: 4,
          newCountryCode: 'DE',
        },
        { ...context, newLevelRank: 4 },
      ),
    ).toEqual(['only a relocation can change country']);
  });

  it('rejects a correction that moves the country', () => {
    expect(
      validateSalaryChange(
        {
          reason: 'correction',
          effectiveDate: '2025-05-01',
          amountMinor: 90000,
          newCountryCode: 'DE',
        },
        context,
      ),
    ).toEqual(['only a relocation can change country']);
  });

  it('rejects a relocation that also changes the level', () => {
    expect(
      validateSalaryChange(
        {
          reason: 'relocation',
          effectiveDate: '2025-05-01',
          amountMinor: 90000,
          newCountryCode: 'DE',
          newLevelId: 4,
        },
        { ...context, newLevelRank: 4 },
      ),
    ).toEqual(['only a promotion or correction can change level']);
  });
});
