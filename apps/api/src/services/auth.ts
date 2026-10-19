import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { DbHandle } from '../db/client';
import type { User } from '../db/schema';
import { countUsers, findUserByEmail, findUserById, insertUser } from '../repositories/users';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function issueSessionToken(
  userId: number,
  secret: string,
  issuedAt: Date,
): Promise<string> {
  const iat = Math.floor(issuedAt.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

/** The user id inside a valid, unexpired token, or null for anything else. */
export async function verifySessionToken(
  token: string,
  secret: string,
  at: Date,
): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      currentDate: at,
    });
    const userId = Number(payload.sub);
    return Number.isInteger(userId) ? { userId } : null;
  } catch {
    return null;
  }
}

export async function createUser(
  db: DbHandle,
  input: { email: string; password: string },
  deps: { now: () => string },
): Promise<number> {
  return insertUser(db, {
    email: input.email,
    passwordHash: await hashPassword(input.password),
    createdAt: deps.now(),
  });
}

/**
 * Creates the single HR user unless a user already exists. An existing user is never changed, so
 * restarting with different credentials does not overwrite a password (there is no password reset).
 */
export async function ensureHrUser(
  db: DbHandle,
  credentials: { email: string; password: string },
  deps: { now: () => string },
): Promise<'created' | 'exists'> {
  if (countUsers(db) > 0) return 'exists';
  await createUser(db, credentials, deps);
  return 'created';
}

// Verified against when the email is unknown, so a miss costs the same as a wrong password.
let decoyHash: Promise<string> | undefined;

export async function login(
  db: DbHandle,
  credentials: { email: string; password: string },
  deps: { jwtSecret: string; clock: () => Date },
): Promise<{ token: string; user: User } | null> {
  const user = findUserByEmail(db, credentials.email);
  if (!user) {
    decoyHash ??= hashPassword('decoy');
    await verifyPassword(await decoyHash, credentials.password);
    return null;
  }
  if (!(await verifyPassword(user.passwordHash, credentials.password))) return null;
  return { token: await issueSessionToken(user.id, deps.jwtSecret, deps.clock()), user };
}

export function getUser(db: DbHandle, id: number): User | undefined {
  return findUserById(db, id);
}
