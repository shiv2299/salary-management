import type { DbHandle } from '../db/client';
import { departments, type Department } from '../db/schema';

export function insertDepartments(db: DbHandle, names: string[]): void {
  db.insert(departments)
    .values(names.map((name) => ({ name })))
    .run();
}

export function listDepartments(db: DbHandle): Department[] {
  return db.select().from(departments).all();
}
