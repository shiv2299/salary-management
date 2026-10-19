import { asc } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import type { FxRates } from '../domain/fx';
import { fxRates } from '../db/schema';

/** The latest-dated rate for each currency. */
export function loadLatestFxRates(db: DbHandle): FxRates {
  const rates: FxRates = {};
  for (const row of db.select().from(fxRates).orderBy(asc(fxRates.asOfDate)).all()) {
    rates[row.currencyCode] = row.rateToBaseNano;
  }
  return rates;
}
