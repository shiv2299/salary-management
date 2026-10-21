import type { SalaryChangePreview, SalaryChangePreviewBody } from '@acme/shared';
import type { DbHandle } from '../db/client';
import { BASE_CURRENCY, convert } from '../domain/fx';
import { peerGroupKey } from '../domain/peer-groups';
import { percentChangeBp, proposedAmount } from '../domain/revision';
import { notFound, unprocessable } from '../errors';
import { listCountries } from '../repositories/countries';
import { findEmployeeListRow } from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { listLevels } from '../repositories/levels';
import { getPeerGroups, toPeerContext, type PeerGroup } from './peer-groups';

/**
 * What a proposed change would look like: the proposed amount (from a percentage or given), how
 * far it moves the salary and where it would sit among the peers of the target country and level.
 * Read-only. Whether the change is allowed is decided when it is submitted, not here.
 */
export function previewSalaryChange(
  db: DbHandle,
  employeeId: number,
  body: SalaryChangePreviewBody,
): SalaryChangePreview {
  const employee = findEmployeeListRow(db, employeeId);
  if (!employee) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${employeeId} not found`);

  const levels = listLevels(db);
  const countries = listCountries(db);
  const targetLevelId = body.newLevelId ?? employee.levelId;
  const targetLevel = levels.find((l) => l.id === targetLevelId);
  if (!targetLevel) {
    throw unprocessable('INVALID_SALARY_CHANGE', `unknown level: ${targetLevelId}`);
  }
  const targetCountryCode = body.newCountryCode ?? employee.countryCode;
  const targetCountry = countries.find((c) => c.code === targetCountryCode);
  if (!targetCountry) {
    throw unprocessable('INVALID_SALARY_CHANGE', `unknown country: ${targetCountryCode}`);
  }

  const rates = loadLatestFxRates(db);
  const currentCurrency = employee.currentCurrencyCode;
  const currencyCode = body.reason === 'relocation' ? targetCountry.currencyCode : currentCurrency;
  const amountMinor =
    body.amountMinor ?? proposedAmount(employee.currentAmountMinor, body.percentageBp!);
  const amountBaseMinor = convert(amountMinor, currencyCode, BASE_CURRENCY, rates);

  const changeBp =
    currencyCode === currentCurrency
      ? percentChangeBp(employee.currentAmountMinor, amountMinor)
      : percentChangeBp(employee.currentAmountBaseMinor, amountBaseMinor);

  const key = { countryCode: targetCountryCode, levelId: targetLevelId };
  const group: PeerGroup = getPeerGroups(db, [key]).get(
    peerGroupKey(key.countryCode, key.levelId),
  ) ?? {
    ...key,
    currencyCode: targetCountry.currencyCode,
    headcount: 0,
    summary: null,
  };

  return {
    current: {
      amountMinor: employee.currentAmountMinor,
      currencyCode: currentCurrency,
      amountBaseMinor: employee.currentAmountBaseMinor,
    },
    proposed: { amountMinor, currencyCode, amountBaseMinor },
    changeBaseMinor: amountBaseMinor - employee.currentAmountBaseMinor,
    changeBp,
    peer: toPeerContext(group, targetLevel.code, { amountMinor, amountBaseMinor }),
  };
}
