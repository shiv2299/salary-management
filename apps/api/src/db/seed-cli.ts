import { MIGRATIONS_FOLDER, loadConfig } from '../config';
import { bootstrapDatabase } from './bootstrap';
import { createDatabase } from './client';

// The CLI reads the clock for the reference date, which defaults to today.
// SEED_REFERENCE_DATE / SEED_RNG_SEED pin both inputs for a reproducible dataset.
const rngSeed = Number(process.env.SEED_RNG_SEED ?? 42);
const referenceDate = process.env.SEED_REFERENCE_DATE ?? new Date().toISOString().slice(0, 10);

const config = loadConfig();
const database = createDatabase(config.DATABASE_PATH);

try {
  const started = performance.now();
  const result = await bootstrapDatabase(database.db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    referenceDate,
    rngSeed,
    now: () => new Date().toISOString(),
    ...(config.HR_SEED_EMAIL && config.HR_SEED_PASSWORD
      ? { hrUser: { email: config.HR_SEED_EMAIL, password: config.HR_SEED_PASSWORD } }
      : {}),
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  if (result.seed.skipped) {
    console.log('Database already has employees; nothing seeded.');
  } else {
    console.log(
      `Seeded ${result.seed.employees} employees, ${result.seed.salaryHistoryRows} salary history rows and ` +
        `${result.seed.revisionBatches} revision batches (reference date ${referenceDate}, ` +
        `RNG seed ${rngSeed}) in ${seconds}s.`,
    );
  }
  console.log(
    result.hrUser === 'created'
      ? 'Created the HR user.'
      : result.hrUser === 'exists'
        ? 'HR user already exists; left unchanged.'
        : 'HR_SEED_EMAIL / HR_SEED_PASSWORD not set; no HR user created.',
  );
} finally {
  database.close();
}
