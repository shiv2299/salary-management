import { Faker, de, en, en_IN } from '@faker-js/faker';
import { convert, type FxRates } from '../domain/fx';
import { currencyExponent } from '../domain/money';
import { proposedAmount } from '../domain/revision';
import { insertCountries, listCountries } from '../repositories/countries';
import { insertDepartments, listDepartments } from '../repositories/departments';
import { countEmployees, markEmployeesInactive } from '../repositories/employees';
import { insertFxRates } from '../repositories/fx-rates';
import { insertLevels, listLevels } from '../repositories/levels';
import { insertSalaryRevisionBatch } from '../repositories/salary-revision-batches';
import { createEmployees, type NewEmployeeInput } from '../services/employees';
import { applySalaryChanges, type SalaryChange } from '../services/salary-writer';
import type { DbHandle } from './client';

export interface SeedOptions {
  rngSeed: number;
  /** Every generated date is an offset back from this ISO date (yyyy-mm-dd). */
  referenceDate: string;
  employeeCount?: number;
}

export interface SeedResult {
  skipped: boolean;
  employees: number;
  salaryHistoryRows: number;
  revisionBatches: number;
  inactiveEmployees: number;
}

// ---- Reference data -------------------------------------------------------------------------

const COUNTRIES = [
  { code: 'IN', name: 'India', currencyCode: 'INR', share: 45 },
  { code: 'US', name: 'United States', currencyCode: 'USD', share: 35 },
  { code: 'DE', name: 'Germany', currencyCode: 'EUR', share: 20 },
] as const;

const DEPARTMENTS = [
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

const LEVELS = [
  { code: 'L1', label: 'Entry', rank: 1, share: 24 },
  { code: 'L2', label: 'Associate', rank: 2, share: 28 },
  { code: 'L3', label: 'Senior', rank: 3, share: 22 },
  { code: 'L4', label: 'Lead', rank: 4, share: 14 },
  { code: 'L5', label: 'Principal', rank: 5, share: 8 },
  { code: 'L6', label: 'Director', rank: 6, share: 4 },
] as const;

/** Fixed, dated rates: the value of one major unit in USD times 10^9. */
const FX_AS_OF_DATE = '2026-01-01';
const FX_RATES: FxRates = { INR: 11_980_000, EUR: 1_080_000_000 };

/** Median annual base pay in whole major units of each country's currency, by level rank 1..6. */
const MEDIAN_PAY_MAJOR: Record<string, readonly number[]> = {
  IN: [600_000, 1_000_000, 1_800_000, 3_000_000, 5_000_000, 8_500_000],
  US: [70_000, 90_000, 120_000, 155_000, 195_000, 250_000],
  DE: [42_000, 55_000, 70_000, 88_000, 110_000, 145_000],
};

// ---- Generation knobs -----------------------------------------------------------------------

const HIRE_SPAN_DAYS = 3650;
const CHANGE_WINDOW_DAYS = 1825;
const CYCLE_COUNT = 5;
const FIRST_CYCLE_DAYS_BEFORE_REFERENCE = 60;
const PAY_SIGMA = 0.12;
const OUTLIER_SHARE = 0.011;
const INACTIVE_SHARE = 0.04;
const MIN_TENURE_FOR_CYCLE_DAYS = 365;
const MIN_QUIET_DAYS_BEFORE_CYCLE = 120;
const MIN_TENURE_FOR_CHANGE_DAYS = 180;
const MEAN_CYCLE_BP = 450;
const HIRE_BATCH_SIZE = 1000;
const WRITE_BATCH_SIZE = 1000;
const INACTIVE_UPDATE_CHUNK = 500;

const INDIVIDUAL_EVENT_COUNT_WEIGHTS = [55, 30, 12, 3];
const INDIVIDUAL_EVENT_KINDS = ['raise', 'promotion', 'relocation'] as const;
const INDIVIDUAL_EVENT_KIND_WEIGHTS = [71, 25, 4];

// ---- Pure helpers (dates, randomness) -------------------------------------------------------

const DAY_MS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function createRng(rngSeed: number) {
  const faker = new Faker({ locale: [en] });
  faker.seed(rngSeed);
  const names: Record<string, Faker> = {
    IN: new Faker({ locale: [en_IN, en] }),
    US: new Faker({ locale: [en] }),
    DE: new Faker({ locale: [de, en] }),
  };
  for (const generator of Object.values(names)) generator.seed(rngSeed);

  const float = () => faker.number.float({ min: 0, max: 1 });
  const int = (min: number, max: number) => faker.number.int({ min, max });

  return {
    float,
    int,
    pick: <T>(items: readonly T[]): T => faker.helpers.arrayElement(items),
    weighted<T>(items: readonly T[], weights: readonly number[]): T {
      let remaining = float() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < items.length; i++) {
        remaining -= weights[i]!;
        if (remaining < 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
    /** Standard normal by Box-Muller, truncated to +-2 so only deliberate outliers leave the fences. */
    truncatedNormal(): number {
      const u1 = Math.max(float(), 1e-12);
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * float());
      return Math.max(-2, Math.min(2, z));
    },
    name(countryCode: string): { firstName: string; lastName: string } {
      const generator = names[countryCode]!;
      return { firstName: generator.person.firstName(), lastName: generator.person.lastName() };
    },
  };
}

type Rng = ReturnType<typeof createRng>;

function medianPayMinor(countryCode: string, currencyCode: string, rank: number): number {
  return MEDIAN_PAY_MAJOR[countryCode]![rank - 1]! * 10 ** currencyExponent(currencyCode);
}

// ---- Seed -----------------------------------------------------------------------------------

interface Worker {
  id: number;
  countryCode: string;
  departmentId: number;
  rank: number;
  hireDate: string;
  /** Last day the employee can receive a change: the reference date, or the exit date. */
  endDate: string;
  amountMinor: number;
  lastChangeDate: string;
}

interface PlannedEvent {
  date: string;
  worker: Worker;
  kind: (typeof INDIVIDUAL_EVENT_KINDS)[number];
}

/**
 * Seeds an empty database (architecture §6): reference data, employees with their hire rows,
 * then five years of salary history. Everything random comes from `rngSeed`, every date is an
 * offset from `referenceDate`, and every write goes through the service layer, so the same two
 * inputs always produce the same rows. Does nothing if any employee already exists.
 */
export function seed(db: DbHandle, options: SeedOptions): SeedResult {
  const { rngSeed, referenceDate, employeeCount = 10_000 } = options;

  if (countEmployees(db) > 0) {
    return {
      skipped: true,
      employees: 0,
      salaryHistoryRows: 0,
      revisionBatches: 0,
      inactiveEmployees: 0,
    };
  }

  const rng = createRng(rngSeed);
  const now = () => `${referenceDate}T00:00:00.000Z`;
  const deps = { now };

  return db.transaction((tx) => {
    insertCountries(
      tx,
      COUNTRIES.map(({ code, name, currencyCode }) => ({ code, name, currencyCode })),
    );
    insertDepartments(
      tx,
      DEPARTMENTS.map((d) => d.name),
    );
    insertLevels(
      tx,
      LEVELS.map(({ code, label, rank }) => ({ code, label, rank })),
    );
    insertFxRates(
      tx,
      Object.entries(FX_RATES).map(([currencyCode, rateToBaseNano]) => ({
        currencyCode,
        asOfDate: FX_AS_OF_DATE,
        rateToBaseNano,
      })),
    );

    const currencyOf = new Map(listCountries(tx).map((c) => [c.code, c.currencyCode]));
    const departmentIdByName = new Map(listDepartments(tx).map((d) => [d.name, d.id]));
    const levelIdByRank = new Map(listLevels(tx).map((l) => [l.rank, l.id]));
    const departmentIds = DEPARTMENTS.map((d) => departmentIdByName.get(d.name)!);
    const payFactorByDepartmentId = new Map(
      DEPARTMENTS.map((d, i) => [departmentIds[i]!, d.payFactor]),
    );
    const rolesByDepartmentId = new Map(DEPARTMENTS.map((d, i) => [departmentIds[i]!, d.roles]));

    const cycleDates = Array.from({ length: CYCLE_COUNT }, (_, k) =>
      addDays(referenceDate, -(FIRST_CYCLE_DAYS_BEFORE_REFERENCE + 365 * (CYCLE_COUNT - 1 - k))),
    );

    // ---- Employees, each with a hire row.
    const workers: Worker[] = [];
    let historyRows = 0;
    for (let start = 0; start < employeeCount; start += HIRE_BATCH_SIZE) {
      const batchSize = Math.min(HIRE_BATCH_SIZE, employeeCount - start);
      const inputs: NewEmployeeInput[] = [];
      const pending: Omit<Worker, 'id'>[] = [];

      for (let i = 0; i < batchSize; i++) {
        const sequence = start + i + 1;
        const countryCode = rng.weighted(
          COUNTRIES.map((c) => c.code),
          COUNTRIES.map((c) => c.share),
        );
        const departmentId = rng.weighted(
          departmentIds,
          DEPARTMENTS.map((d) => d.share),
        );
        const rank = rng.weighted(
          LEVELS.map((l) => l.rank),
          LEVELS.map((l) => l.share),
        );
        const currencyCode = currencyOf.get(countryCode)!;
        const hireDate = addDays(referenceDate, -rng.int(1, HIRE_SPAN_DAYS));

        // Hire pay is discounted by the raises the increment cycles will add, so current pay
        // (not hire pay) is what sits around the level's median.
        const cyclesAfterHire = cycleDates.filter(
          (d) => daysBetween(hireDate, d) >= MIN_TENURE_FOR_CYCLE_DAYS,
        ).length;
        let major =
          MEDIAN_PAY_MAJOR[countryCode]![rank - 1]! *
          payFactorByDepartmentId.get(departmentId)! *
          Math.exp(PAY_SIGMA * rng.truncatedNormal()) *
          (1 + MEAN_CYCLE_BP / 10_000) ** -cyclesAfterHire;
        if (rng.float() < OUTLIER_SHARE) {
          major *= rng.float() < 0.6 ? 1.9 + rng.float() * 0.7 : 0.4 + rng.float() * 0.15;
        }
        const amountMinor = Math.round(major) * 10 ** currencyExponent(currencyCode);

        const { firstName, lastName } = rng.name(countryCode);
        const handle = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '');
        const role = rng.pick(rolesByDepartmentId.get(departmentId)!);

        const inactive = rng.float() < INACTIVE_SHARE;
        const span = daysBetween(hireDate, referenceDate);
        const endDate = inactive
          ? addDays(hireDate, rng.int(Math.min(90, span), span))
          : referenceDate;

        inputs.push({
          firstName,
          lastName,
          email: `${handle}.${sequence}@acme.example`,
          countryCode,
          departmentId,
          levelId: levelIdByRank.get(rank)!,
          jobTitle: role,
          hireDate,
          amountMinor,
        });
        pending.push({
          countryCode,
          departmentId,
          rank,
          hireDate,
          endDate,
          amountMinor,
          lastChangeDate: hireDate,
        });
      }

      const ids = createEmployees(tx, inputs, deps);
      historyRows += ids.length;
      ids.forEach((id, i) => workers.push({ id, ...pending[i]! }));
    }

    // ---- Individual changes, planned up front and applied in date order among the cycles.
    const events = planIndividualEvents(rng, workers, referenceDate);

    let buffer: SalaryChange[] = [];
    const flush = () => {
      if (buffer.length === 0) return;
      applySalaryChanges(tx, buffer, deps);
      historyRows += buffer.length;
      buffer = [];
    };

    let revisionBatches = 0;
    let nextEvent = 0;
    const applyEventsBefore = (limit: string | null) => {
      while (nextEvent < events.length && (limit === null || events[nextEvent]!.date < limit)) {
        const change = buildIndividualChange(rng, events[nextEvent++]!, currencyOf, levelIdByRank);
        if (change) buffer.push(change);
        if (buffer.length >= WRITE_BATCH_SIZE) flush();
      }
      flush();
    };

    for (const cycleDate of cycleDates) {
      applyEventsBefore(cycleDate);
      const cycleBp = rng.int(MEAN_CYCLE_BP - 100, MEAN_CYCLE_BP + 100);
      const eligible = workers.filter(
        (w) =>
          daysBetween(w.hireDate, cycleDate) >= MIN_TENURE_FOR_CYCLE_DAYS &&
          w.endDate > cycleDate &&
          daysBetween(w.lastChangeDate, cycleDate) >= MIN_QUIET_DAYS_BEFORE_CYCLE,
      );

      for (const country of COUNTRIES) {
        for (const departmentId of departmentIds) {
          const members = eligible.filter(
            (w) => w.countryCode === country.code && w.departmentId === departmentId,
          );
          if (members.length === 0) continue;

          const percentageBp = Math.max(100, cycleBp + rng.int(-75, 75));
          const batchId = insertSalaryRevisionBatch(tx, {
            createdAt: now(),
            effectiveDate: cycleDate,
            percentageBp,
            employeeCount: members.length,
            note: `Annual increment ${cycleDate.slice(0, 4)}`,
          });
          revisionBatches++;

          const changes: SalaryChange[] = members.map((w) => {
            w.amountMinor = proposedAmount(w.amountMinor, percentageBp);
            w.lastChangeDate = cycleDate;
            return {
              employeeId: w.id,
              reason: 'raise',
              amountMinor: w.amountMinor,
              currencyCode: country.currencyCode,
              effectiveDate: cycleDate,
              batchId,
            };
          });
          applySalaryChanges(tx, changes, deps);
          historyRows += changes.length;
        }
      }
    }
    applyEventsBefore(null);

    // ---- A few leavers. Their history already stops at their exit date.
    const leavers = workers.filter((w) => w.endDate !== referenceDate).map((w) => w.id);
    for (let i = 0; i < leavers.length; i += INACTIVE_UPDATE_CHUNK) {
      markEmployeesInactive(tx, leavers.slice(i, i + INACTIVE_UPDATE_CHUNK), now());
    }

    return {
      skipped: false,
      employees: workers.length,
      salaryHistoryRows: historyRows,
      revisionBatches,
      inactiveEmployees: leavers.length,
    };
  });
}

/** Plans each employee's individual changes, sorted by date. */
function planIndividualEvents(rng: Rng, people: Worker[], reference: string): PlannedEvent[] {
  const planned: PlannedEvent[] = [];
  for (const worker of people) {
    const count = rng.weighted([0, 1, 2, 3], INDIVIDUAL_EVENT_COUNT_WEIGHTS);
    const windowStart = [
      addDays(worker.hireDate, MIN_TENURE_FOR_CHANGE_DAYS),
      addDays(reference, -CHANGE_WINDOW_DAYS),
    ].reduce((a, b) => (a > b ? a : b));
    const windowEnd = worker.endDate;
    if (windowStart > windowEnd) continue;

    for (let i = 0; i < count; i++) {
      planned.push({
        date: addDays(windowStart, rng.int(0, daysBetween(windowStart, windowEnd))),
        worker,
        kind: rng.weighted(INDIVIDUAL_EVENT_KINDS, INDIVIDUAL_EVENT_KIND_WEIGHTS),
      });
    }
  }
  // Array.prototype.sort is stable, so equal dates keep their planned order.
  return planned.sort((a, b) => a.date.localeCompare(b.date));
}

/** Turns a planned event into a salary change, updating the worker's tracked state to match. */
function buildIndividualChange(
  rng: Rng,
  event: PlannedEvent,
  currencyOf: Map<string, string>,
  levelIdByRank: Map<number, number>,
): SalaryChange | null {
  const { worker, date } = event;
  const currencyCode = currencyOf.get(worker.countryCode)!;
  const base = { employeeId: worker.id, effectiveDate: date };
  worker.lastChangeDate = date;

  if (event.kind === 'promotion' && worker.rank < LEVELS.length) {
    const ratio =
      MEDIAN_PAY_MAJOR[worker.countryCode]![worker.rank]! /
      MEDIAN_PAY_MAJOR[worker.countryCode]![worker.rank - 1]!;
    worker.rank += 1;
    worker.amountMinor = Math.round(worker.amountMinor * ratio * (1 + rng.float() * 0.05));
    return {
      ...base,
      reason: 'promotion',
      amountMinor: worker.amountMinor,
      currencyCode,
      levelId: levelIdByRank.get(worker.rank)!,
    };
  }

  if (event.kind === 'relocation') {
    const destination = rng.pick(COUNTRIES.filter((c) => c.code !== worker.countryCode));
    const converted = convert(worker.amountMinor, currencyCode, destination.currencyCode, FX_RATES);
    // The converted pay is re-benchmarked to the destination market for the same level (the
    // employee keeps their position within the peer range), with some variation, so a
    // relocation does not by itself make anyone a statistical outlier.
    const sourceMedianInDestination = convert(
      medianPayMinor(worker.countryCode, currencyCode, worker.rank),
      currencyCode,
      destination.currencyCode,
      FX_RATES,
    );
    const marketPull =
      medianPayMinor(destination.code, destination.currencyCode, worker.rank) /
      sourceMedianInDestination;
    worker.countryCode = destination.code;
    worker.amountMinor = Math.round(converted * marketPull * (0.95 + rng.float() * 0.1));
    return {
      ...base,
      reason: 'relocation',
      amountMinor: worker.amountMinor,
      currencyCode: destination.currencyCode,
      countryCode: destination.code,
    };
  }

  worker.amountMinor = proposedAmount(worker.amountMinor, rng.int(300, 600));
  return { ...base, reason: 'raise', amountMinor: worker.amountMinor, currencyCode };
}
