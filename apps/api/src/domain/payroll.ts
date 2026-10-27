export type SalaryReason = 'hire' | 'raise' | 'promotion' | 'relocation' | 'correction';

export interface PayRow {
  id: number;
  effectiveDate: string;
  reason: SalaryReason;
  amountMinor: number;
  currencyCode: string;
  /** The amount in USD at the latest static rates. */
  amountBaseMinor: number;
  /** The country in force from this row onward. */
  countryCode: string;
}

export interface PayrollPerson {
  employeeId: number;
  hireDate: string;
  status: 'active' | 'inactive';
  deactivatedOn: string | null;
  departmentId: number;
  /** In any order. */
  rows: PayRow[];
}

/**
 * Whether the employee is paid on `date`: hired on or before it, and either still active or
 * deactivated after it. An inactive employee with no deactivation date is in no payroll.
 * ISO yyyy-mm-dd dates compare lexicographically.
 */
export function isOnPayroll(person: PayrollPerson, date: string): boolean {
  if (person.hireDate > date) return false;
  if (person.status === 'active') return true;
  return person.deactivatedOn !== null && person.deactivatedOn > date;
}

/** The row in force on `date`: latest effective date on or before it, highest id on a tie. */
export function payInForce(person: PayrollPerson, date: string): PayRow | null {
  let current: PayRow | null = null;
  for (const row of person.rows) {
    if (row.effectiveDate > date) continue;
    if (
      current === null ||
      row.effectiveDate > current.effectiveDate ||
      (row.effectiveDate === current.effectiveDate && row.id > current.id)
    ) {
      current = row;
    }
  }
  return current;
}

export interface PayrollGroupTotal {
  headcount: number;
  totalBaseMinor: number;
}

export interface PayrollSnapshot {
  date: string;
  headcount: number;
  totalBaseMinor: number;
  byCountry: Map<string, PayrollGroupTotal>;
  byDepartment: Map<number, PayrollGroupTotal>;
}

/** The pay counted for the person on `date`, or null when they are not on the payroll. */
function paidRow(person: PayrollPerson, date: string): PayRow | null {
  return isOnPayroll(person, date) ? payInForce(person, date) : null;
}

function addTo<K>(map: Map<K, PayrollGroupTotal>, key: K, amountBaseMinor: number): void {
  const group = map.get(key) ?? { headcount: 0, totalBaseMinor: 0 };
  group.headcount += 1;
  group.totalBaseMinor += amountBaseMinor;
  map.set(key, group);
}

/** Headcount and USD pay on `date`, in total and grouped by the country and department of the time. */
export function payrollAt(people: PayrollPerson[], date: string): PayrollSnapshot {
  const snapshot: PayrollSnapshot = {
    date,
    headcount: 0,
    totalBaseMinor: 0,
    byCountry: new Map(),
    byDepartment: new Map(),
  };
  for (const person of people) {
    const row = paidRow(person, date);
    if (row === null) continue;
    snapshot.headcount += 1;
    snapshot.totalBaseMinor += row.amountBaseMinor;
    addTo(snapshot.byCountry, row.countryCode, row.amountBaseMinor);
    addTo(snapshot.byDepartment, person.departmentId, row.amountBaseMinor);
  }
  return snapshot;
}

export const PAYROLL_CAUSES = [
  'hires',
  'raises',
  'promotions',
  'relocations',
  'corrections',
  'leavers',
] as const;
export type PayrollCause = (typeof PAYROLL_CAUSES)[number];

export interface PayrollChange {
  fromTotalBaseMinor: number;
  toTotalBaseMinor: number;
  causes: Record<PayrollCause, { amountBaseMinor: number; count: number }>;
}

const CAUSE_OF_REASON: Record<SalaryReason, PayrollCause> = {
  hire: 'hires',
  raise: 'raises',
  promotion: 'promotions',
  relocation: 'relocations',
  correction: 'corrections',
};

/**
 * From the payroll on `from` to the payroll on `to` (from < to). Each person is walked through the
 * dates in (from, to] where something can change. On a day they stay on the payroll, each row dated
 * that day, in id order, adds its own step under its own reason: its amount minus the amount in
 * force just before it. On a day they enter or leave, the whole step goes to hires or leavers.
 */
export function payrollChangeByCause(
  people: PayrollPerson[],
  from: string,
  to: string,
): PayrollChange {
  const causes = Object.fromEntries(
    PAYROLL_CAUSES.map((cause) => [cause, { amountBaseMinor: 0, count: 0 }]),
  ) as PayrollChange['causes'];
  const add = (cause: PayrollCause, amount: number): void => {
    causes[cause].amountBaseMinor += amount;
    causes[cause].count += 1;
  };

  let fromTotalBaseMinor = 0;
  let toTotalBaseMinor = 0;
  for (const person of people) {
    const start = paidRow(person, from);
    let paid = start === null ? null : start.amountBaseMinor;
    fromTotalBaseMinor += paid ?? 0;

    const dates = new Set<string>();
    for (const row of person.rows) dates.add(row.effectiveDate);
    dates.add(person.hireDate);
    if (person.deactivatedOn !== null) dates.add(person.deactivatedOn);
    const events = [...dates].filter((d) => d > from && d <= to).sort();

    for (const date of events) {
      const row = paidRow(person, date);
      const next = row === null ? null : row.amountBaseMinor;
      if (paid === null && next !== null) {
        add('hires', next);
      } else if (paid !== null && next === null) {
        add('leavers', -paid);
      } else if (paid !== null && next !== null) {
        const sameDay = person.rows
          .filter((r) => r.effectiveDate === date)
          .sort((a, b) => a.id - b.id);
        let before = paid;
        for (const r of sameDay) {
          add(CAUSE_OF_REASON[r.reason], r.amountBaseMinor - before);
          before = r.amountBaseMinor;
        }
      }
      paid = next;
    }
    toTotalBaseMinor += paid ?? 0;
  }
  return { fromTotalBaseMinor, toTotalBaseMinor, causes };
}
