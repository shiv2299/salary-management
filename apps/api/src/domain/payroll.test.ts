import { describe, expect, it } from 'vitest';
import {
  PAYROLL_CAUSES,
  isOnPayroll,
  payInForce,
  payrollAt,
  payrollChangeByCause,
  type PayRow,
  type PayrollPerson,
  type SalaryReason,
} from './payroll';

function row(
  id: number,
  effectiveDate: string,
  amount: number,
  reason: SalaryReason = 'raise',
  countryCode = 'US',
): PayRow {
  return {
    id,
    effectiveDate,
    reason,
    amountMinor: amount,
    currencyCode: 'USD',
    amountBaseMinor: amount,
    countryCode,
  };
}

function person(overrides: Partial<PayrollPerson> & { rows: PayRow[] }): PayrollPerson {
  return {
    employeeId: 1,
    hireDate: '2020-01-01',
    status: 'active',
    deactivatedOn: null,
    departmentId: 1,
    ...overrides,
  };
}

const FROM = '2025-01-15';
const TO = '2026-01-15';

describe('isOnPayroll', () => {
  it('counts an employee from their hire date', () => {
    const p = person({ hireDate: '2025-08-01', rows: [] });
    expect(isOnPayroll(p, '2025-07-31')).toBe(false);
    expect(isOnPayroll(p, '2025-08-01')).toBe(true);
  });

  it('stops counting a leaver on their deactivation date', () => {
    const p = person({ status: 'inactive', deactivatedOn: '2025-03-01', rows: [] });
    expect(isOnPayroll(p, '2025-02-28')).toBe(true);
    expect(isOnPayroll(p, '2025-03-01')).toBe(false);
  });

  it('never counts an inactive employee without a deactivation date', () => {
    const p = person({ status: 'inactive', deactivatedOn: null, rows: [] });
    expect(isOnPayroll(p, '2020-01-01')).toBe(false);
    expect(isOnPayroll(p, '2023-06-01')).toBe(false);
    expect(isOnPayroll(p, '2030-01-01')).toBe(false);
  });
});

describe('payInForce', () => {
  it('takes the latest row dated on or before the date', () => {
    const p = person({
      rows: [row(2, '2025-06-01', 11_000_000), row(1, '2020-03-01', 10_000_000, 'hire')],
    });
    expect(payInForce(p, '2025-05-31')?.amountBaseMinor).toBe(10_000_000);
    expect(payInForce(p, '2025-06-01')?.amountBaseMinor).toBe(11_000_000);
  });

  it('lets the higher id win a same-day tie', () => {
    const p = person({ rows: [row(8, '2024-05-01', 2), row(7, '2024-05-01', 1)] });
    expect(payInForce(p, '2024-05-01')?.id).toBe(8);
  });

  it('ignores a backdated row with a higher id', () => {
    const p = person({
      rows: [row(8, '2024-05-01', 2), row(7, '2024-05-01', 1), row(9, '2023-01-01', 3)],
    });
    expect(payInForce(p, '2024-06-01')?.id).toBe(8);
  });

  it('returns null before the first row', () => {
    const p = person({ rows: [row(1, '2020-03-01', 1, 'hire')] });
    expect(payInForce(p, '2020-02-29')).toBeNull();
  });
});

describe('payrollAt', () => {
  it('sums headcount and USD pay of everyone on the payroll', () => {
    const snapshot = payrollAt(
      [
        person({ employeeId: 1, rows: [row(1, '2020-01-01', 1_000, 'hire')] }),
        person({
          employeeId: 2,
          rows: [row(2, '2021-01-01', 2_000, 'hire'), row(3, '2022-01-01', 2_500)],
        }),
        person({
          employeeId: 3,
          status: 'inactive',
          deactivatedOn: '2026-06-01',
          rows: [row(4, '2021-01-01', 4_000, 'hire')],
        }),
        person({
          employeeId: 4,
          status: 'inactive',
          deactivatedOn: null,
          rows: [row(5, '2021-01-01', 8_000, 'hire')],
        }),
      ],
      '2026-01-15',
    );
    expect(snapshot.date).toBe('2026-01-15');
    expect(snapshot.headcount).toBe(3);
    expect(snapshot.totalBaseMinor).toBe(1_000 + 2_500 + 4_000);
  });

  it('counts a relocated employee under the country of the time', () => {
    const p = person({
      rows: [
        row(1, '2020-01-01', 1_000, 'hire', 'IN'),
        row(2, '2024-01-01', 2_000, 'relocation', 'US'),
      ],
    });
    const before = payrollAt([p], '2023-12-31');
    expect([...before.byCountry.keys()]).toEqual(['IN']);
    expect(before.byCountry.get('IN')).toEqual({ headcount: 1, totalBaseMinor: 1_000 });
    const after = payrollAt([p], '2024-01-01');
    expect([...after.byCountry.keys()]).toEqual(['US']);
    expect(after.byCountry.get('US')).toEqual({ headcount: 1, totalBaseMinor: 2_000 });
  });

  it('groups by department', () => {
    const snapshot = payrollAt(
      [
        person({ employeeId: 1, departmentId: 1, rows: [row(1, '2020-01-01', 100, 'hire')] }),
        person({ employeeId: 2, departmentId: 1, rows: [row(2, '2020-01-01', 200, 'hire')] }),
        person({ employeeId: 3, departmentId: 2, rows: [row(3, '2020-01-01', 400, 'hire')] }),
      ],
      '2026-01-15',
    );
    expect(snapshot.byDepartment.get(1)).toEqual({ headcount: 2, totalBaseMinor: 300 });
    expect(snapshot.byDepartment.get(2)).toEqual({ headcount: 1, totalBaseMinor: 400 });
  });
});

describe('payrollChangeByCause', () => {
  it('puts a raise inside the window under raises', () => {
    const change = payrollChangeByCause(
      [
        person({
          rows: [row(1, '2020-01-01', 10_000_000, 'hire'), row(2, '2025-06-01', 11_000_000)],
        }),
      ],
      FROM,
      TO,
    );
    expect(change.fromTotalBaseMinor).toBe(10_000_000);
    expect(change.toTotalBaseMinor).toBe(11_000_000);
    expect(change.causes.raises).toEqual({ amountBaseMinor: 1_000_000, count: 1 });
  });

  it('counts a new hire at their first pay', () => {
    const change = payrollChangeByCause(
      [person({ hireDate: '2025-08-01', rows: [row(1, '2025-08-01', 5_000_000, 'hire')] })],
      FROM,
      TO,
    );
    expect(change.causes.hires).toEqual({ amountBaseMinor: 5_000_000, count: 1 });
    expect(change.fromTotalBaseMinor).toBe(0);
    expect(change.toTotalBaseMinor).toBe(5_000_000);
  });

  it("takes a leaver's last pay off and keeps their raise", () => {
    const change = payrollChangeByCause(
      [
        person({
          status: 'inactive',
          deactivatedOn: '2025-09-01',
          rows: [row(1, '2020-01-01', 6_000_000, 'hire'), row(2, '2025-04-01', 7_000_000)],
        }),
      ],
      FROM,
      TO,
    );
    expect(change.causes.raises).toEqual({ amountBaseMinor: 1_000_000, count: 1 });
    expect(change.causes.leavers).toEqual({ amountBaseMinor: -7_000_000, count: 1 });
    expect(change.toTotalBaseMinor).toBe(0);
  });

  it('gives each row dated the same day its own step, in id order', () => {
    const change = payrollChangeByCause(
      [
        person({
          rows: [
            row(1, '2020-01-01', 10_000_000, 'hire'),
            row(8, '2025-05-01', 11_800_000, 'correction'),
            row(7, '2025-05-01', 12_000_000, 'promotion'),
          ],
        }),
      ],
      FROM,
      TO,
    );
    expect(change.causes.promotions).toEqual({ amountBaseMinor: 2_000_000, count: 1 });
    expect(change.causes.corrections).toEqual({ amountBaseMinor: -200_000, count: 1 });
  });

  it('puts a raise and a promotion on the same day under their own causes', () => {
    const change = payrollChangeByCause(
      [
        person({
          rows: [
            row(1, '2020-01-01', 10_000_000, 'hire'),
            row(5, '2025-08-28', 10_500_000, 'raise'),
            row(6, '2025-08-28', 12_000_000, 'promotion'),
          ],
        }),
      ],
      FROM,
      TO,
    );
    expect(change.causes.raises).toEqual({ amountBaseMinor: 500_000, count: 1 });
    expect(change.causes.promotions).toEqual({ amountBaseMinor: 1_500_000, count: 1 });
    expect(change.toTotalBaseMinor - change.fromTotalBaseMinor).toBe(2_000_000);
  });

  it('ignores someone hired and gone inside the window', () => {
    const change = payrollChangeByCause(
      [
        person({
          hireDate: '2025-03-01',
          status: 'inactive',
          deactivatedOn: '2025-10-01',
          rows: [row(1, '2025-03-01', 3_000_000, 'hire')],
        }),
      ],
      FROM,
      TO,
    );
    expect(change.fromTotalBaseMinor).toBe(0);
    expect(change.toTotalBaseMinor).toBe(0);
    expect(change.causes.hires).toEqual({ amountBaseMinor: 3_000_000, count: 1 });
    expect(change.causes.leavers).toEqual({ amountBaseMinor: -3_000_000, count: 1 });
    expect(change.causes.raises).toEqual({ amountBaseMinor: 0, count: 0 });
    expect(change.causes.promotions).toEqual({ amountBaseMinor: 0, count: 0 });
    expect(change.causes.relocations).toEqual({ amountBaseMinor: 0, count: 0 });
    expect(change.causes.corrections).toEqual({ amountBaseMinor: 0, count: 0 });
  });

  it('reports zero for every cause when from equals to', () => {
    const change = payrollChangeByCause(
      [person({ rows: [row(1, '2020-01-01', 1_000, 'hire'), row(2, '2025-06-01', 2_000)] })],
      TO,
      TO,
    );
    for (const cause of PAYROLL_CAUSES) {
      expect(change.causes[cause]).toEqual({ amountBaseMinor: 0, count: 0 });
    }
    expect(change.fromTotalBaseMinor).toBe(change.toTotalBaseMinor);
  });

  it('sums the causes to the payroll difference over generated histories', () => {
    let seed = 20260115;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
    const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
    const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
    const startDay = dayNumber('2018-01-01');
    const endDay = dayNumber('2026-01-15');
    const laterReasons: SalaryReason[] = ['raise', 'promotion', 'relocation', 'correction'];

    const people: PayrollPerson[] = [];
    let rowId = 1;
    for (let i = 1; i <= 300; i++) {
      const hireDay = int(startDay, dayNumber('2025-12-31'));
      const rows: PayRow[] = [row(rowId++, isoOf(hireDay), int(1, 20) * 1_000_000, 'hire')];
      const later = int(0, 4);
      for (let k = 0; k < later; k++) {
        const day = int(hireDay, endDay);
        const reason = laterReasons[int(0, laterReasons.length - 1)] as SalaryReason;
        rows.push(row(rowId++, isoOf(day), int(1, 20) * 1_000_000, reason));
      }
      const inactive = next() < 0.15;
      const hasDate = next() < 0.7;
      people.push({
        employeeId: i,
        hireDate: isoOf(hireDay),
        status: inactive ? 'inactive' : 'active',
        deactivatedOn: inactive && hasDate ? isoOf(int(hireDay, endDay)) : null,
        departmentId: int(1, 5),
        rows,
      });
    }

    const windows: [string, string][] = [
      ['2024-01-15', '2025-01-15'],
      ['2025-01-15', '2026-01-15'],
      ['2019-06-30', '2026-01-15'],
    ];
    for (const [from, to] of windows) {
      const change = payrollChangeByCause(people, from, to);
      const sum = PAYROLL_CAUSES.reduce((acc, c) => acc + change.causes[c].amountBaseMinor, 0);
      expect(sum).toBe(change.toTotalBaseMinor - change.fromTotalBaseMinor);
      expect(change.fromTotalBaseMinor).toBe(payrollAt(people, from).totalBaseMinor);
      expect(change.toTotalBaseMinor).toBe(payrollAt(people, to).totalBaseMinor);
    }
  });
});
