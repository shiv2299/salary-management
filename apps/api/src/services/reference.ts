import type { DbHandle } from '../db/client';
import { BASE_CURRENCY, convert } from '../domain/fx';
import { badRequest } from '../errors';
import { listCountries } from '../repositories/countries';
import { listDepartments } from '../repositories/departments';
import { listLatestFxRates, loadLatestFxRates } from '../repositories/fx-rates';
import { listLevels } from '../repositories/levels';

export const getCountries = (db: DbHandle) => listCountries(db);
export const getDepartments = (db: DbHandle) => listDepartments(db);
export const getLevels = (db: DbHandle) => listLevels(db);

export function getFxRates(db: DbHandle) {
  return { baseCurrency: BASE_CURRENCY, rates: listLatestFxRates(db) };
}

/** Server-side conversion at the latest static rates, so the browser never does money arithmetic. */
export function convertAmount(db: DbHandle, amountMinor: number, from: string, to: string) {
  const rates = loadLatestFxRates(db);
  for (const code of [from, to]) {
    if (code !== BASE_CURRENCY && rates[code] === undefined) {
      throw badRequest('UNKNOWN_CURRENCY', `No FX rate for currency: ${code}`);
    }
  }
  return { amountMinor: convert(amountMinor, from, to, rates), currencyCode: to };
}
