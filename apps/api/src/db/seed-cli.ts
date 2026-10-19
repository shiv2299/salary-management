import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { loadConfig } from '../config';
import { createDatabase } from './client';
import { seed } from './seed';

// The one place the seed reads the clock: the reference date defaults to today, and
// SEED_REFERENCE_DATE / SEED_RNG_SEED pin both inputs for a reproducible dataset.
const rngSeed = Number(process.env.SEED_RNG_SEED ?? 42);
const referenceDate = process.env.SEED_REFERENCE_DATE ?? new Date().toISOString().slice(0, 10);

const config = loadConfig();
const database = createDatabase(config.DATABASE_PATH);

try {
  migrate(database.db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
  const started = performance.now();
  const result = seed(database.db, { rngSeed, referenceDate });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  if (result.skipped) {
    console.log('Database already has employees; nothing seeded.');
  } else {
    console.log(
      `Seeded ${result.employees} employees, ${result.salaryHistoryRows} salary history rows and ` +
        `${result.revisionBatches} revision batches (reference date ${referenceDate}, ` +
        `RNG seed ${rngSeed}) in ${seconds}s.`,
    );
  }
} finally {
  database.close();
}
