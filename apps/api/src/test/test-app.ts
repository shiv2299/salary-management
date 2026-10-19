import { buildApp } from '../app';
import { createUser } from '../services/auth';
import { FIXED_NOW, createTestDb } from './test-db';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const HR_EMAIL = 'hr@acme.test';
export const HR_PASSWORD = 'correct horse';

/** An app over a fresh in-memory database with the one HR user created. */
export async function createTestApp(options: { now?: () => Date; secureCookies?: boolean } = {}) {
  const database = createTestDb();
  await createUser(
    database.db,
    { email: HR_EMAIL, password: HR_PASSWORD },
    { now: () => FIXED_NOW },
  );
  const app = buildApp({
    database,
    jwtSecret: TEST_JWT_SECRET,
    secureCookies: options.secureCookies ?? false,
    ...(options.now ? { now: options.now } : {}),
  });

  async function loginCookie(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: HR_EMAIL, password: HR_PASSWORD },
    });
    const header = response.headers['set-cookie'];
    return String(Array.isArray(header) ? header[0] : header).split(';')[0]!;
  }

  return { app, database, loginCookie };
}
