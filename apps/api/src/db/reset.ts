import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
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

  // Dropping, migrating and restoring the users is one transaction, so a failure part-way rolls
  // back to the original database. Drizzle's own `migrate` opens its own transaction, which cannot
  // nest, so the migration statements are applied here the same way it applies them. Dropping
  // Drizzle's migrations table too means every migration applies again. The pragma is a no-op
  // inside a transaction, so it is toggled outside.
  const migrations = readMigrationFiles({ migrationsFolder: options.migrationsFolder });
  db.run(sql`pragma foreign_keys = off`);
  try {
    db.transaction((tx) => {
      for (const { name } of tables) tx.run(sql.raw(`drop table "${name.replaceAll('"', '""')}"`));
      tx.run(
        sql`create table "__drizzle_migrations" (id integer primary key, hash text not null, created_at numeric)`,
      );
      for (const migration of migrations) {
        for (const statement of migration.sql) tx.run(sql.raw(statement));
        tx.run(
          sql`insert into "__drizzle_migrations" ("hash", "created_at") values (${migration.hash}, ${migration.folderMillis})`,
        );
      }
      insertUsers(tx, kept);
    });
  } finally {
    db.run(sql`pragma foreign_keys = on`);
  }

  return bootstrapDatabase(db, options);
}
