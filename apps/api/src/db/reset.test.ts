import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getUser, login, verifySessionToken } from '../services/auth';
import { createEmployees, deactivateEmployee } from '../services/employees';
import { bootstrapDatabase } from './bootstrap';
import { createDatabase, type Db } from './client';
import { resetDatabase } from './reset';
import { employees, salaryHistory, salaryRevisionBatches, users } from './schema';

const options = {
  migrationsFolder: resolve(import.meta.dirname, '../../drizzle'),
  referenceDate: '2026-06-30',
  rngSeed: 42,
  employeeCount: 50,
  now: () => '2026-06-30T00:00:00.000Z',
};
const hrUser = { email: 'hr@acme.test', password: 'correct horse' };
const loginDeps = {
  jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
  clock: () => new Date('2026-06-30T09:00:00.000Z'),
};

function dump(db: Db): string {
  return JSON.stringify([
    db.select().from(employees).orderBy(employees.id).all(),
    db.select().from(salaryHistory).orderBy(salaryHistory.id).all(),
    db.select().from(salaryRevisionBatches).orderBy(salaryRevisionBatches.id).all(),
  ]);
}

// Each test migrates and seeds a database, some more than once, so they get more than the default
// 5 s on a busy machine.
describe('resetDatabase', { timeout: 20_000 }, () => {
  it('replaces every employee and salary row with a fresh seed', async () => {
    const { db } = createDatabase(':memory:');
    await bootstrapDatabase(db, { ...options, hrUser });
    createEmployees(
      db,
      [
        {
          firstName: 'Extra',
          lastName: 'Person',
          email: 'extra@acme.test',
          countryCode: 'US',
          departmentId: 1,
          levelId: 1,
          jobTitle: 'Engineer',
          hireDate: '2026-01-05',
          amountMinor: 9_000_000,
        },
      ],
      { now: options.now },
    );
    deactivateEmployee(db, 1, { now: options.now });

    const result = await resetDatabase(db, { ...options, hrUser });

    const fresh = createDatabase(':memory:').db;
    await bootstrapDatabase(fresh, { ...options, hrUser });
    expect(result.seed).toMatchObject({ skipped: false, employees: 50 });
    expect(dump(db)).toBe(dump(fresh));
  });

  it('keeps the HR login, its password and its id, so a signed-in session stays valid', async () => {
    const { db } = createDatabase(':memory:');
    await bootstrapDatabase(db, { ...options, hrUser });
    const session = (await login(db, hrUser, loginDeps))!;
    const other = { email: 'other@acme.test', password: 'another password' };

    const result = await resetDatabase(db, { ...options, hrUser: other });

    expect(result.hrUser).toBe('exists');
    expect(await login(db, hrUser, loginDeps)).not.toBeNull();
    expect(await login(db, other, loginDeps)).toBeNull();
    const verified = await verifySessionToken(
      session.token,
      loginDeps.jwtSecret,
      loginDeps.clock(),
    );
    expect(verified?.userId).toBe(session.user.id);
    expect(getUser(db, verified!.userId)?.email).toBe('hr@acme.test');
  });

  it('sets up a database that has never been migrated', async () => {
    const { db } = createDatabase(':memory:');

    const result = await resetDatabase(db, { ...options, hrUser });

    expect(result).toMatchObject({ seed: { skipped: false, employees: 50 }, hrUser: 'created' });
  });

  describe('when a migration fails', () => {
    let scratch: string | undefined;
    afterEach(() => {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      scratch = undefined;
    });

    it('leaves the original employees and users untouched and rejects', async () => {
      scratch = mkdtempSync(join(tmpdir(), 'reset-test-'));
      cpSync(options.migrationsFolder, scratch, { recursive: true });
      writeFileSync(join(scratch, '9999_broken.sql'), 'create table broken (;');
      const journalPath = join(scratch, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
        entries: {
          idx: number;
          version: string;
          when: number;
          tag: string;
          breakpoints: boolean;
        }[];
      };
      const last = journal.entries[journal.entries.length - 1]!;
      journal.entries.push({
        idx: last.idx + 1,
        version: last.version,
        when: last.when + 1000,
        tag: '9999_broken',
        breakpoints: true,
      });
      writeFileSync(journalPath, JSON.stringify(journal));

      const { db } = createDatabase(':memory:');
      await bootstrapDatabase(db, { ...options, hrUser });
      const before = dump(db);
      const usersBefore = db.select().from(users).all();

      await expect(
        resetDatabase(db, { ...options, migrationsFolder: scratch, hrUser }),
      ).rejects.toThrow();

      expect(dump(db)).toBe(before);
      expect(db.select().from(users).all()).toEqual(usersBefore);
    });
  });
});
