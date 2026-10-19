import type { DbHandle } from '../db/client';
import { salaryRevisionBatches, type NewSalaryRevisionBatch } from '../db/schema';

export function insertSalaryRevisionBatch(db: DbHandle, row: NewSalaryRevisionBatch): number {
  return db
    .insert(salaryRevisionBatches)
    .values(row)
    .returning({ id: salaryRevisionBatches.id })
    .get().id;
}
