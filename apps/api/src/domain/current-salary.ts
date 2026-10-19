/**
 * The current salary row: latest effectiveDate wins (ISO yyyy-mm-dd compares lexicographically),
 * and the highest id breaks ties, so a correction dated the same day becomes current.
 * Pure: the input array is not mutated.
 */
export function selectCurrentRow<T extends { id: number; effectiveDate: string }>(rows: T[]): T {
  if (rows.length === 0) throw new Error('Cannot select a current row from no rows');
  let current = rows[0] as T;
  for (const row of rows) {
    if (
      row.effectiveDate > current.effectiveDate ||
      (row.effectiveDate === current.effectiveDate && row.id > current.id)
    ) {
      current = row;
    }
  }
  return current;
}
