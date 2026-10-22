import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { insertUsers, listUsers } from '../repositories/users';
import { bootstrapDatabase, type BootstrapOptions, type BootstrapResult } from './bootstrap';
import type { Db } from './client';

/**
 * Starts the database over: drops every table, applies the migrations and seeds a fresh dataset.
 * The users are carried across with their ids and password hashes, so the HR login and any open
 * session survive. The API must not be running while this executes.
 */
export async function resetDatabase(db: Db, options: BootstrapOptions): Promise<BootstrapResult> {
  const tables = db.all<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`,
  );
  const kept = tables.some((table) => table.name === 'users') ? listUsers(db) : [];

  // Dropping Drizzle's own migrations table too means every migration applies again.
  db.run(sql`pragma foreign_keys = off`);
  try {
    db.transaction((tx) => {
      for (const { name } of tables) tx.run(sql.raw(`drop table "${name}"`));
    });
  } finally {
    db.run(sql`pragma foreign_keys = on`);
  }

  migrate(db, { migrationsFolder: options.migrationsFolder });
  insertUsers(db, kept);
  return bootstrapDatabase(db, options);
}
