/** Today as yyyy-mm-dd in UTC, the same calendar the API checks effective dates against. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
