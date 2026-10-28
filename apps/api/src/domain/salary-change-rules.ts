export type SalaryChangeReason = 'raise' | 'promotion' | 'relocation' | 'correction' | 'hire';

export interface SalaryChangeInput {
  reason: SalaryChangeReason;
  effectiveDate: string;
  amountMinor: number;
  newLevelId?: number;
  newCountryCode?: string;
}

export interface SalaryChangeContext {
  today: string;
  hireDate: string;
  status: 'active' | 'inactive';
  /**
   * The amount paid on the change's effective date, in the currency of that date. For a change
   * dated today this is the current salary; for a backdated one it is the pay of the time.
   */
  amountInForceMinor: number;
  currentCountryCode: string;
  currentLevelRank: number;
  newLevelRank?: number;
}

/**
 * Business rules for one effective-dated salary change (architecture §7).
 * Returns human-readable violations; an empty list means the change is valid.
 */
export function validateSalaryChange(
  input: SalaryChangeInput,
  context: SalaryChangeContext,
): string[] {
  const violations: string[] = [];

  if (input.effectiveDate > context.today) {
    violations.push('effective date must not be in the future');
  }
  if (input.effectiveDate < context.hireDate) {
    violations.push('effective date must not be before the hire date');
  }
  if (context.status !== 'active') {
    violations.push('employee must be active');
  }
  if (input.amountMinor <= 0) {
    violations.push('amount must be greater than zero');
  }

  switch (input.reason) {
    case 'raise':
      if (input.amountMinor <= context.amountInForceMinor) {
        violations.push('a raise must increase the amount in force on its effective date');
      }
      if (input.newLevelId !== undefined || input.newCountryCode !== undefined) {
        violations.push('a raise cannot change level or country');
      }
      break;
    case 'promotion':
      if (input.newLevelId === undefined) {
        violations.push('a promotion requires a new level');
      } else if (
        context.newLevelRank === undefined ||
        context.newLevelRank <= context.currentLevelRank
      ) {
        violations.push('a promotion must move to a higher level rank');
      }
      if (input.amountMinor < context.amountInForceMinor) {
        violations.push('a promotion must not lower the amount in force on its effective date');
      }
      if (input.newCountryCode !== undefined) {
        violations.push('only a relocation can change country');
      }
      break;
    case 'relocation':
      if (input.newCountryCode === undefined) {
        violations.push('a relocation requires a new country');
      } else if (input.newCountryCode === context.currentCountryCode) {
        violations.push('a relocation must move to a different country');
      }
      if (input.newLevelId !== undefined) {
        violations.push('only a promotion or correction can change level');
      }
      break;
    case 'correction':
      if (input.newCountryCode !== undefined) {
        violations.push('only a relocation can change country');
      }
      break;
    case 'hire':
      violations.push('hire rows are created only with the employee');
      break;
  }

  return violations;
}
