import type { LevelBandsResponse } from '@acme/shared';
import type { DbHandle } from '../db/client';
import { levelBands } from '../domain/level-bands';
import { notFound } from '../errors';
import { listCountries } from '../repositories/countries';
import { listActivePeerAmounts } from '../repositories/employees';
import { listLevels } from '../repositories/levels';

/** The typical range of each level in one country, for its active employees. */
export function getLevelBands(db: DbHandle, countryCode: string): LevelBandsResponse {
  const country = listCountries(db).find((c) => c.code === countryCode);
  if (!country) throw notFound('COUNTRY_NOT_FOUND', `Country ${countryCode} does not exist`);

  const levels = listLevels(db).map((l) => ({ levelId: l.id, levelCode: l.code, rank: l.rank }));
  const members = listActivePeerAmounts(
    db,
    levels.map((l) => ({ countryCode, levelId: l.levelId })),
  );
  return {
    countryCode,
    currencyCode: country.currencyCode,
    ...levelBands(levels, members, country.currencyCode),
  };
}
