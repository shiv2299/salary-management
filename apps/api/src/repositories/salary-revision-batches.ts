import { desc, inArray } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import {
  salaryRevisionBatches,
  type NewSalaryRevisionBatch,
  type SalaryRevisionBatch,
} from '../db/schema';

export function insertSalaryRevisionBatch(db: DbHandle, row: NewSalaryRevisionBatch): number {
  return db
    .insert(salaryRevisionBatches)
    .values(row)
    .returning({ id: salaryRevisionBatches.id })
    .get().id;
}

export function findBatchesByIds(db: DbHandle, ids: number[]): SalaryRevisionBatch[] {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(salaryRevisionBatches)
    .where(inArray(salaryRevisionBatches.id, ids))
    .all();
}

/** The batch with the latest effective date; the most recently created one on a tie. */
export function findLatestSalaryRevisionBatch(db: DbHandle): SalaryRevisionBatch | undefined {
  return db
    .select()
    .from(salaryRevisionBatches)
    .orderBy(desc(salaryRevisionBatches.effectiveDate), desc(salaryRevisionBatches.id))
    .limit(1)
    .get();
}
