import type { DbHandle } from '../db/client';
import { countries, type Country } from '../db/schema';

export function listCountries(db: DbHandle): Country[] {
  return db.select().from(countries).all();
}
