import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { percentChangeBp } from '../domain/revision';
import {
  computeDistribution,
  isOutlier,
  MIN_PEER_GROUP_SIZE,
  outlierFences,
} from '../domain/stats';
import { createDatabase } from './client';
import { seed } from './seed';
import {
  countries,
  departments,
  employees,
  fxRates,
  levels,
  salaryHistory,
  salaryRevisionBatches,
} from './schema';

const REFERENCE_DATE = '2026-06-30';
const SMALL = 300;

function freshDb() {
  const database = createDatabase(':memory:');
  migrate(database.db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
  return database.db;
}

function seeded(options: { rngSeed?: number; employeeCount?: number } = {}) {
  const db = freshDb();
  const result = seed(db, {
    rngSeed: options.rngSeed ?? 42,
    referenceDate: REFERENCE_DATE,
    employeeCount: options.employeeCount ?? SMALL,
  });
  return { db, result };
}

function dump(db: ReturnType<typeof freshDb>): string {
  return JSON.stringify([
    db.select().from(employees).orderBy(employees.id).all(),
    db.select().from(salaryHistory).orderBy(salaryHistory.id).all(),
    db.select().from(salaryRevisionBatches).orderBy(salaryRevisionBatches.id).all(),
  ]);
}

function promotionUplifts(db: ReturnType<typeof freshDb>): number[] {
  const ordered = db
    .select()
    .from(salaryHistory)
    .all()
    .sort(
      (a, b) =>
        a.employeeId - b.employeeId ||
        a.effectiveDate.localeCompare(b.effectiveDate) ||
        a.id - b.id,
    );
  return ordered.flatMap((row, i) => {
    const before = ordered[i - 1];
    return row.reason === 'promotion' && before?.employeeId === row.employeeId
      ? [percentChangeBp(before.amountMinor, row.amountMinor)]
      : [];
  });
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

describe('seed', () => {
  let small: ReturnType<typeof seeded>;
  let large: ReturnType<typeof seeded>;

  beforeAll(() => {
    small = seeded();
    large = seeded({ employeeCount: 2000 });
  }, 60_000);

  it('creates 3 countries, 7 departments, 6 levels and one FX rate per non-USD currency', () => {
    const { db } = small;
    expect(
      db
        .select()
        .from(countries)
        .all()
        .map((c) => [c.code, c.currencyCode]),
    ).toEqual([
      ['IN', 'INR'],
      ['US', 'USD'],
      ['DE', 'EUR'],
    ]);
    expect(db.select().from(departments).all()).toHaveLength(7);
    expect(
      db
        .select()
        .from(levels)
        .all()
        .map((l) => l.rank),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(
      db
        .select()
        .from(fxRates)
        .all()
        .map((r) => r.currencyCode)
        .sort(),
    ).toEqual(['EUR', 'INR']);
  });

  it('creates the requested number of employees spread over every country, department and level', () => {
    const rows = small.db.select().from(employees).all();
    expect(rows).toHaveLength(SMALL);
    expect(small.result).toMatchObject({ skipped: false, employees: SMALL });
    expect(new Set(rows.map((e) => e.countryCode))).toEqual(new Set(['IN', 'US', 'DE']));
    expect(new Set(rows.map((e) => e.departmentId)).size).toBe(7);
    expect(new Set(rows.map((e) => e.levelId)).size).toBe(6);
  });

  it('gives every employee a unique email', () => {
    const emails = small.db
      .select()
      .from(employees)
      .all()
      .map((e) => e.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('reports history and batch counts that match the database', () => {
    expect(small.result.salaryHistoryRows).toBe(small.db.select().from(salaryHistory).all().length);
    expect(small.result.revisionBatches).toBe(
      small.db.select().from(salaryRevisionBatches).all().length,
    );
  });

  it('marks a small share of employees inactive', () => {
    const inactive = small.db
      .select()
      .from(employees)
      .all()
      .filter((e) => e.status === 'inactive');
    expect(inactive.length).toBeGreaterThan(0);
    expect(inactive.length / SMALL).toBeLessThan(0.1);
    expect(small.result.inactiveEmployees).toBe(inactive.length);
  });

  it('never dates a salary change after the reference date or before the hire date', () => {
    const hireDates = new Map(
      small.db
        .select()
        .from(employees)
        .all()
        .map((e) => [e.id, e.hireDate]),
    );
    const rows = small.db.select().from(salaryHistory).all();
    for (const row of rows) {
      expect(row.effectiveDate <= REFERENCE_DATE).toBe(true);
      expect(row.effectiveDate >= hireDates.get(row.employeeId)!).toBe(true);
    }
    for (const hireDate of hireDates.values()) {
      expect(hireDate <= REFERENCE_DATE).toBe(true);
      expect(daysBetween(hireDate, REFERENCE_DATE)).toBeLessThanOrEqual(3650);
    }
  });

  it('keeps every employee current salary equal to their latest history row', () => {
    const history = small.db.select().from(salaryHistory).all();
    const latest = new Map<number, (typeof history)[number]>();
    for (const row of history) {
      const best = latest.get(row.employeeId);
      if (
        !best ||
        row.effectiveDate > best.effectiveDate ||
        (row.effectiveDate === best.effectiveDate && row.id > best.id)
      ) {
        latest.set(row.employeeId, row);
      }
    }
    for (const employee of small.db.select().from(employees).all()) {
      const row = latest.get(employee.id)!;
      expect(employee).toMatchObject({
        currentAmountMinor: row.amountMinor,
        currentCurrencyCode: row.currencyCode,
        currentEffectiveDate: row.effectiveDate,
        currentReason: row.reason,
        levelId: row.levelId,
        countryCode: row.countryCode,
      });
    }
  });

  it('records each bulk revision as a batch whose employee count equals its member rows', () => {
    const batches = small.db.select().from(salaryRevisionBatches).all();
    const members = small.db
      .select()
      .from(salaryHistory)
      .all()
      .filter((r) => r.batchId !== null);
    expect(batches.length).toBeGreaterThan(0);

    for (const batch of batches) {
      const rows = members.filter((r) => r.batchId === batch.id);
      expect(rows.length).toBe(batch.employeeCount);
      expect(rows.every((r) => r.reason === 'raise')).toBe(true);
      expect(rows.every((r) => r.effectiveDate === batch.effectiveDate)).toBe(true);
      expect(batch.percentageBp).toBeGreaterThan(0);
      expect(batch.percentageBp).toBeLessThanOrEqual(1000);
    }
  });

  it('only gives a bulk revision to employees hired at least 180 days before it', () => {
    const hireDates = new Map(
      small.db
        .select()
        .from(employees)
        .all()
        .map((e) => [e.id, e.hireDate]),
    );
    for (const row of small.db.select().from(salaryHistory).all()) {
      if (row.batchId !== null)
        expect(
          daysBetween(hireDates.get(row.employeeId)!, row.effectiveDate),
        ).toBeGreaterThanOrEqual(180);
    }
  });

  it('runs one increment cycle a year for the last ten years', () => {
    const dates = [
      ...new Set(
        small.db
          .select()
          .from(salaryRevisionBatches)
          .all()
          .map((b) => b.effectiveDate),
      ),
    ].sort();
    expect(dates).toEqual([
      '2017-05-03',
      '2018-05-03',
      '2019-05-03',
      '2020-05-02',
      '2021-05-02',
      '2022-05-02',
      '2023-05-02',
      '2024-05-01',
      '2025-05-01',
      '2026-05-01',
    ]);
  });

  it('has salary changes in every one of the last ten years', () => {
    const ages = small.db
      .select()
      .from(salaryHistory)
      .all()
      .filter((r) => r.reason !== 'hire')
      .map((r) => daysBetween(r.effectiveDate, REFERENCE_DATE));
    for (let year = 0; year < 10; year++) {
      expect(ages.some((age) => age > year * 365 && age <= (year + 1) * 365)).toBe(true);
    }
  });

  it('gives individual changes to people in their early years, not only in the last five', () => {
    const old = small.db
      .select()
      .from(salaryHistory)
      .all()
      .filter(
        (r) =>
          r.batchId === null &&
          r.reason !== 'hire' &&
          daysBetween(r.effectiveDate, REFERENCE_DATE) > 5 * 365,
      );
    expect(old.length).toBeGreaterThan(0);
  });

  it('includes promotions that raise the level and relocations that change country and currency', () => {
    const history = small.db.select().from(salaryHistory).orderBy(salaryHistory.id).all();
    const rankById = new Map(
      small.db
        .select()
        .from(levels)
        .all()
        .map((l) => [l.id, l.rank]),
    );
    const previous = new Map<number, (typeof history)[number]>();
    let promotions = 0;
    let relocations = 0;
    const ordered = history
      .slice()
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id);
    for (const row of ordered) {
      const before = previous.get(row.employeeId);
      if (before && row.reason === 'promotion') {
        promotions++;
        expect(rankById.get(row.levelId)!).toBeGreaterThan(rankById.get(before.levelId)!);
        expect(row.amountMinor).toBeGreaterThan(before.amountMinor);
      }
      if (before && row.reason === 'relocation') {
        relocations++;
        expect(row.countryCode).not.toBe(before.countryCode);
        expect(row.currencyCode).not.toBe(before.currencyCode);
      }
      previous.set(row.employeeId, row);
    }
    expect(promotions).toBeGreaterThan(0);
    expect(relocations).toBeGreaterThan(0);
  });

  it('produces identical database content for the same RNG seed and reference date', () => {
    expect(dump(seeded().db)).toBe(dump(small.db));
  });

  it('produces different data for a different RNG seed', () => {
    expect(dump(seeded({ rngSeed: 43 }).db)).not.toBe(dump(small.db));
  });

  it('skips and writes nothing when employees already exist', () => {
    const { db } = seeded();
    const before = dump(db);

    const result = seed(db, { rngSeed: 7, referenceDate: REFERENCE_DATE, employeeCount: SMALL });

    expect(result.skipped).toBe(true);
    expect(dump(db)).toBe(before);
  });

  it('puts between 1% and 2.5% of active employees outside their country and level fences', () => {
    const { db } = large;
    const active = db
      .select()
      .from(employees)
      .all()
      .filter((e) => e.status === 'active');

    const groups = new Map<string, number[]>();
    for (const e of active) {
      const key = `${e.countryCode}:${e.levelId}`;
      groups.set(key, [...(groups.get(key) ?? []), e.currentAmountBaseMinor]);
    }

    let outliers = 0;
    for (const amounts of groups.values()) {
      if (amounts.length < MIN_PEER_GROUP_SIZE) continue;
      const fences = outlierFences(computeDistribution(amounts));
      outliers += amounts.filter((a) => isOutlier(a, fences)).length;
    }

    const share = outliers / active.length;
    expect(share).toBeGreaterThanOrEqual(0.01);
    expect(share).toBeLessThanOrEqual(0.025);
  });

  it('raises pay by 10% to 20% on every promotion', () => {
    const uplifts = promotionUplifts(large.db);
    expect(uplifts.length).toBeGreaterThan(0);
    expect(uplifts.every((bp) => bp >= 1000 && bp <= 2000)).toBe(true);
  });

  it('promotes between 5% and 25% of employees at some point', () => {
    const promoted = new Set(
      large.db
        .select()
        .from(salaryHistory)
        .all()
        .filter((r) => r.reason === 'promotion')
        .map((r) => r.employeeId),
    );
    expect(promoted.size / 2000).toBeGreaterThanOrEqual(0.05);
    expect(promoted.size / 2000).toBeLessThanOrEqual(0.25);
  });

  it("dates every deactivation after the employee's last salary change and before the reference date", () => {
    const lastChange = new Map<number, string>();
    for (const row of small.db.select().from(salaryHistory).all()) {
      if (row.effectiveDate > (lastChange.get(row.employeeId) ?? ''))
        lastChange.set(row.employeeId, row.effectiveDate);
    }
    for (const e of small.db.select().from(employees).all()) {
      if (e.status === 'active') {
        expect(e.deactivatedOn).toBeNull();
      } else {
        expect(e.deactivatedOn! > lastChange.get(e.id)!).toBe(true);
        expect(e.deactivatedOn! < REFERENCE_DATE).toBe(true);
      }
    }
  });

  it('marks between 3% and 5% of employees inactive, spread over the years and including the last twelve months', () => {
    const inactive = large.db
      .select()
      .from(employees)
      .all()
      .filter((e) => e.status === 'inactive');
    expect(inactive.length / 2000).toBeGreaterThanOrEqual(0.03);
    expect(inactive.length / 2000).toBeLessThanOrEqual(0.05);
    expect(new Set(inactive.map((e) => e.deactivatedOn!.slice(0, 4))).size).toBeGreaterThanOrEqual(
      5,
    );
    expect(inactive.some((e) => daysBetween(e.deactivatedOn!, REFERENCE_DATE) <= 365)).toBe(true);
  });
});
