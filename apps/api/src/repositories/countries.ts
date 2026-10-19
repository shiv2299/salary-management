import type { DbHandle } from '../db/client';
import { countries, type Country, type NewCountry } from '../db/schema';

export function listCountries(db: DbHandle): Country[] {
  return db.select().from(countries).all();
}

export function insertCountries(db: DbHandle, rows: NewCountry[]): void {
  db.insert(countries).values(rows).run();
}
