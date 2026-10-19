import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { ensureHrUser } from '../services/auth';
import type { Db } from './client';
import { seed, type SeedResult } from './seed';

export interface BootstrapOptions {
  migrationsFolder: string;
  /** Every seeded date is an offset back from this ISO date (yyyy-mm-dd). */
  referenceDate: string;
  rngSeed: number;
  employeeCount?: number;
  /** Created only when the database has no user yet. */
  hrUser?: { email: string; password: string };
  now: () => string;
}

export interface BootstrapResult {
  seed: SeedResult;
  hrUser: 'created' | 'exists' | 'skipped';
}

/**
 * Brings a database to a usable state: applies migrations, seeds the dataset if there are no
 * employees yet, and creates the HR user if there is no user yet. Every step is a no-op on a
 * database that already has its data, so it is safe to run on every boot (architecture §6).
 */
export async function bootstrapDatabase(
  db: Db,
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  migrate(db, { migrationsFolder: options.migrationsFolder });

  const seeded = seed(db, {
    rngSeed: options.rngSeed,
    referenceDate: options.referenceDate,
    ...(options.employeeCount !== undefined ? { employeeCount: options.employeeCount } : {}),
  });

  if (!options.hrUser) return { seed: seeded, hrUser: 'skipped' };
  const hrUser = await ensureHrUser(db, options.hrUser, { now: options.now });
  return { seed: seeded, hrUser };
}
