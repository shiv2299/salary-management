import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import {
  SESSION_TTL_SECONDS,
  createUser,
  ensureHrUser,
  hashPassword,
  issueSessionToken,
  login,
  verifyPassword,
  verifySessionToken,
} from './auth';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const issuedAt = new Date('2026-01-15T09:00:00.000Z');

describe('passwords', () => {
  it('hashes with argon2id and never stores the plain password', async () => {
    const hash = await hashPassword('correct horse');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword(hash, 'correct horse')).toBe(true);
    expect(await verifyPassword(hash, 'wrong horse')).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips the user id', async () => {
    const token = await issueSessionToken(7, SECRET, issuedAt);

    expect(await verifySessionToken(token, SECRET, issuedAt)).toEqual({ userId: 7 });
  });

  it('is valid for eight hours and not a second longer', async () => {
    const token = await issueSessionToken(7, SECRET, issuedAt);
    const at = (seconds: number) => new Date(issuedAt.getTime() + seconds * 1000);

    expect(SESSION_TTL_SECONDS).toBe(8 * 60 * 60);
    expect(await verifySessionToken(token, SECRET, at(SESSION_TTL_SECONDS - 1))).toEqual({
      userId: 7,
    });
    expect(await verifySessionToken(token, SECRET, at(SESSION_TTL_SECONDS + 1))).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueSessionToken(7, 'another-secret-that-is-at-least-32-chars', issuedAt);

    expect(await verifySessionToken(token, SECRET, issuedAt)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifySessionToken('not-a-jwt', SECRET, issuedAt)).toBeNull();
  });
});

describe('login', () => {
  let database: ReturnType<typeof createTestDb>;
  const deps = { jwtSecret: SECRET, now: () => FIXED_NOW };

  beforeEach(async () => {
    database = createTestDb();
    await createUser(database.db, { email: 'hr@acme.test', password: 'correct horse' }, deps);
  });

  it('returns a session token for the right credentials', async () => {
    const result = await login(
      database.db,
      { email: 'hr@acme.test', password: 'correct horse' },
      { jwtSecret: SECRET, clock: () => issuedAt },
    );

    expect(await verifySessionToken(result!.token, SECRET, issuedAt)).toEqual({
      userId: result!.user.id,
    });
    expect(result!.user.email).toBe('hr@acme.test');
  });

  it('returns nothing for a wrong password', async () => {
    const result = await login(
      database.db,
      { email: 'hr@acme.test', password: 'wrong' },
      { jwtSecret: SECRET, clock: () => issuedAt },
    );

    expect(result).toBeNull();
  });

  it('returns nothing for an unknown email', async () => {
    const result = await login(
      database.db,
      { email: 'nobody@acme.test', password: 'correct horse' },
      { jwtSecret: SECRET, clock: () => issuedAt },
    );

    expect(result).toBeNull();
  });
});

describe('ensureHrUser', () => {
  const deps = { jwtSecret: SECRET, now: () => FIXED_NOW };
  const credentials = { email: 'hr@acme.test', password: 'correct horse' };

  it('creates the HR user when there is none', async () => {
    const database = createTestDb();

    expect(await ensureHrUser(database.db, credentials, deps)).toBe('created');
    expect(
      await login(database.db, credentials, { jwtSecret: SECRET, clock: () => issuedAt }),
    ).not.toBeNull();
  });

  it('leaves an existing user untouched, whatever credentials it is given', async () => {
    const database = createTestDb();
    await ensureHrUser(database.db, credentials, deps);

    const again = await ensureHrUser(
      database.db,
      { email: 'other@acme.test', password: 'another password' },
      deps,
    );

    expect(again).toBe('exists');
    const loginDeps = { jwtSecret: SECRET, clock: () => issuedAt };
    expect(await login(database.db, credentials, loginDeps)).not.toBeNull();
    expect(
      await login(
        database.db,
        { email: 'other@acme.test', password: 'another password' },
        loginDeps,
      ),
    ).toBeNull();
  });
});
