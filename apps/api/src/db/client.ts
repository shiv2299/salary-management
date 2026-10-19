import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Sqlite from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const IN_MEMORY = ':memory:';

export function createDatabase(path: string) {
  if (path !== IN_MEMORY) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Sqlite(path);
  sqlite.pragma('foreign_keys = ON');
  if (path !== IN_MEMORY) {
    sqlite.pragma('journal_mode = WAL');
  }

  return {
    db: drizzle({ client: sqlite }),
    ping(): void {
      sqlite.prepare('select 1').get();
    },
    close(): void {
      sqlite.close();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>;

export type Db = Database['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either the root database or an open transaction; repositories accept both. */
export type DbHandle = Db | Tx;
