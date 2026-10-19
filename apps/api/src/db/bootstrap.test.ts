import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { login } from '../services/auth';
import { bootstrapDatabase } from './bootstrap';
import { createDatabase } from './client';
import { employees } from './schema';

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

describe('bootstrapDatabase', () => {
  it('migrates, seeds and creates the HR user on an empty database', async () => {
    const { db } = createDatabase(':memory:');

    const result = await bootstrapDatabase(db, { ...options, hrUser });

    expect(result.seed.skipped).toBe(false);
    expect(result.seed.employees).toBe(50);
    expect(result.hrUser).toBe('created');
    expect(db.select().from(employees).all()).toHaveLength(50);
    expect(await login(db, hrUser, loginDeps)).not.toBeNull();
  });

  it('does nothing the second time it runs', async () => {
    const { db } = createDatabase(':memory:');
    await bootstrapDatabase(db, { ...options, hrUser });

    const again = await bootstrapDatabase(db, {
      ...options,
      hrUser: { email: 'other@acme.test', password: 'another password' },
    });

    expect(again.seed.skipped).toBe(true);
    expect(again.hrUser).toBe('exists');
    expect(db.select().from(employees).all()).toHaveLength(50);
    expect(await login(db, hrUser, loginDeps)).not.toBeNull();
  });

  it('skips the HR user when no credentials are configured and none exists', async () => {
    const { db } = createDatabase(':memory:');

    const result = await bootstrapDatabase(db, options);

    expect(result.hrUser).toBe('skipped');
    expect(result.seed.employees).toBe(50);
  });
});
