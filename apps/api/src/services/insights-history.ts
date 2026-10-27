import type { DbHandle } from '../db/client';
import { BASE_CURRENCY, convert } from '../domain/fx';
import { increaseEvents, summariseIncreases, type IncreaseEvent } from '../domain/increases';
import {
  PAYROLL_CAUSES,
  payrollAt,
  payrollChangeByCause,
  type PayrollGroupTotal,
  type PayrollPerson,
  type PayrollSnapshot,
} from '../domain/payroll';
import { percentChangeBpOrNull } from '../domain/revision';
import {
  isWithin,
  previousTrailingYear,
  trailingWindowStart,
  trailingYear,
} from '../domain/trailing-window';
import { listCountries } from '../repositories/countries';
import { listDepartments } from '../repositories/departments';
import { listPayrollEmployees } from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { listAllSalaryHistory } from '../repositories/salary-history';

/** Everyone ever paid, with their history converted once at the latest static rates. */
function loadHistoryPeople(db: DbHandle): PayrollPerson[] {
  const rates = loadLatestFxRates(db);
  const rowsByEmployee = new Map<number, PayrollPerson['rows']>();
  for (const row of listAllSalaryHistory(db)) {
    const rows = rowsByEmployee.get(row.employeeId) ?? [];
    rows.push({
      id: row.id,
      effectiveDate: row.effectiveDate,
      reason: row.reason,
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      amountBaseMinor: convert(row.amountMinor, row.currencyCode, BASE_CURRENCY, rates),
      countryCode: row.countryCode,
    });
    rowsByEmployee.set(row.employeeId, rows);
  }
  return listPayrollEmployees(db).map((employee) => ({
    employeeId: employee.id,
    hireDate: employee.hireDate,
    status: employee.status,
    deactivatedOn: employee.deactivatedOn,
    departmentId: employee.departmentId,
    rows: rowsByEmployee.get(employee.id) ?? [],
  }));
}

/** Every country and department, in reference order, with the label to show. */
function referenceGroups(db: DbHandle) {
  return {
    countries: listCountries(db).map((c) => ({ key: c.code, label: c.name })),
    departments: listDepartments(db).map((d) => ({ key: String(d.id), label: d.name })),
  };
}

const NONE: PayrollGroupTotal = { headcount: 0, totalBaseMinor: 0 };

/** Payroll at each year end from the earliest hire year, then today. */
export function getPayrollTrend(db: DbHandle, today: string) {
  const people = loadHistoryPeople(db);
  const groups = referenceGroups(db);
  const todayYear = Number(today.slice(0, 4));
  const firstYear = people.reduce(
    (first, person) => Math.min(first, Number(person.hireDate.slice(0, 4))),
    todayYear,
  );

  const toPoint = (snapshot: PayrollSnapshot, year: number, isToday: boolean) => ({
    date: snapshot.date,
    year,
    isToday,
    headcount: snapshot.headcount,
    totalBaseMinor: snapshot.totalBaseMinor,
    byCountry: groups.countries.map((g) => ({
      ...g,
      ...(snapshot.byCountry.get(g.key) ?? NONE),
    })),
    byDepartment: groups.departments.map((g) => ({
      ...g,
      ...(snapshot.byDepartment.get(Number(g.key)) ?? NONE),
    })),
  });

  const points: ReturnType<typeof toPoint>[] = [];
  for (let year = firstYear; year < todayYear; year += 1) {
    points.push(toPoint(payrollAt(people, `${year}-12-31`), year, false));
  }
  const now = payrollAt(people, today);
  points.push(toPoint(now, todayYear, true));

  const yearAgo = payrollAt(people, trailingWindowStart(today, 1));
  return {
    baseCurrency: BASE_CURRENCY,
    asOf: today,
    points,
    summary: {
      totalBaseMinor: now.totalBaseMinor,
      yearAgoTotalBaseMinor: yearAgo.totalBaseMinor,
      changeBp: percentChangeBpOrNull(yearAgo.totalBaseMinor, now.totalBaseMinor),
      headcount: now.headcount,
      yearAgoHeadcount: yearAgo.headcount,
    },
  };
}

/** Why payroll differs from a year ago, by cause. */
export function getPayrollChange(db: DbHandle, today: string) {
  const from = trailingWindowStart(today, 1);
  const change = payrollChangeByCause(loadHistoryPeople(db), from, today);
  const causes = PAYROLL_CAUSES.map((cause) => ({ cause, ...change.causes[cause] }));
  let largestAddition: (typeof PAYROLL_CAUSES)[number] | null = null;
  let largest = 0;
  for (const { cause, amountBaseMinor } of causes) {
    if (amountBaseMinor > largest) {
      largest = amountBaseMinor;
      largestAddition = cause;
    }
  }
  return {
    baseCurrency: BASE_CURRENCY,
    from,
    to: today,
    fromTotalBaseMinor: change.fromTotalBaseMinor,
    toTotalBaseMinor: change.toTotalBaseMinor,
    changeBaseMinor: change.toTotalBaseMinor - change.fromTotalBaseMinor,
    causes,
    largestAddition,
  };
}

/** Raises and promotions per calendar year and over the last two 12-month windows. */
export function getRaiseStats(db: DbHandle, today: string) {
  const events = loadHistoryPeople(db).flatMap(increaseEvents);
  const groups = referenceGroups(db);
  const todayYear = Number(today.slice(0, 4));
  const firstYear = events.reduce(
    (first, event) => Math.min(first, Number(event.effectiveDate.slice(0, 4))),
    todayYear,
  );

  const inYear = (year: number) => (e: IncreaseEvent) => e.effectiveDate.startsWith(`${year}-`);
  const years = [];
  for (let year = firstYear; year <= todayYear; year += 1) {
    const ofYear = events.filter(inYear(year));
    years.push({
      year,
      yearToDate: year === todayYear,
      all: summariseIncreases(ofYear),
      byCountry: groups.countries.map((g) => ({
        ...g,
        ...summariseIncreases(ofYear.filter((e) => e.countryCode === g.key)),
      })),
      byDepartment: groups.departments.map((g) => ({
        ...g,
        ...summariseIncreases(ofYear.filter((e) => String(e.departmentId) === g.key)),
      })),
    });
  }

  const windowStats = (window: { after: string; through: string }) => ({
    ...summariseIncreases(events.filter((e) => isWithin(e.effectiveDate, window))),
    ...window,
  });
  return {
    baseCurrency: BASE_CURRENCY,
    asOf: today,
    years,
    trailing: {
      current: windowStats(trailingYear(today)),
      previous: windowStats(previousTrailingYear(today)),
    },
  };
}
