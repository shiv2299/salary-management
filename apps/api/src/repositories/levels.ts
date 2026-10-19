import type { DbHandle } from '../db/client';
import { levels, type Level, type NewLevel } from '../db/schema';

export function insertLevels(db: DbHandle, rows: NewLevel[]): void {
  db.insert(levels).values(rows).run();
}

export function listLevels(db: DbHandle): Level[] {
  return db.select().from(levels).all();
}
