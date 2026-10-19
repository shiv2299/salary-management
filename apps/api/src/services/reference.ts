import type { DbHandle } from '../db/client';
import { BASE_CURRENCY } from '../domain/fx';
import { listCountries } from '../repositories/countries';
import { listDepartments } from '../repositories/departments';
import { listLatestFxRates } from '../repositories/fx-rates';
import { listLevels } from '../repositories/levels';

export const getCountries = (db: DbHandle) => listCountries(db);
export const getDepartments = (db: DbHandle) => listDepartments(db);
export const getLevels = (db: DbHandle) => listLevels(db);

export function getFxRates(db: DbHandle) {
  return { baseCurrency: BASE_CURRENCY, rates: listLatestFxRates(db) };
}
