import { buildApp } from './app';
import { MIGRATIONS_FOLDER, loadConfig } from './config';
import { bootstrapDatabase } from './db/bootstrap';
import { createDatabase } from './db/client';

function readConfig() {
  try {
    return loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const config = readConfig();
const database = createDatabase(config.DATABASE_PATH);
const app = buildApp({
  database,
  jwtSecret: config.JWT_SECRET,
  secureCookies: config.NODE_ENV === 'production',
  logger: { level: config.LOG_LEVEL },
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    database.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// The one place boot reads the clock: the seed's reference date is today, so the salary-changes
// window always has recent data.
const SEED_RNG_SEED = 42;

try {
  app.log.info('preparing database (first boot also seeds the demo dataset, which takes a while)');
  const bootstrap = await bootstrapDatabase(database.db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    referenceDate: new Date().toISOString().slice(0, 10),
    rngSeed: SEED_RNG_SEED,
    now: () => new Date().toISOString(),
    ...(config.HR_SEED_EMAIL && config.HR_SEED_PASSWORD
      ? { hrUser: { email: config.HR_SEED_EMAIL, password: config.HR_SEED_PASSWORD } }
      : {}),
  });
  app.log.info({ seeded: !bootstrap.seed.skipped, hrUser: bootstrap.hrUser }, 'database ready');
  if (bootstrap.hrUser === 'skipped') {
    app.log.warn('HR_SEED_EMAIL and HR_SEED_PASSWORD are not set; no HR user was created');
  }
} catch (error) {
  app.log.error(error, 'failed to prepare database');
  database.close();
  process.exit(1);
}

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error, 'failed to start');
  database.close();
  process.exit(1);
}
