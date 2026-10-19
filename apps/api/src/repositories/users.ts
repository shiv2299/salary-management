import { eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import { users, type NewUser, type User } from '../db/schema';

export function findUserByEmail(db: DbHandle, email: string): User | undefined {
  return db.select().from(users).where(eq(users.email, email)).get();
}

export function findUserById(db: DbHandle, id: number): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function insertUser(db: DbHandle, user: NewUser): number {
  return db.insert(users).values(user).returning({ id: users.id }).get().id;
}
