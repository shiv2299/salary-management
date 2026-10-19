import { buildApp } from './app';
import { loadConfig } from './config';
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

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error, 'failed to start');
  database.close();
  process.exit(1);
}
