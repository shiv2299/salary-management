// Display and input helpers only. Amounts are integer minor units end to end; nothing here does FX
// or rounding arithmetic. Conversion and rounding belong to the server (docs/architecture.md §3).

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: 'en-IN', EUR: 'de-DE', USD: 'en-US' };

function localeFor(currencyCode: string): string {
  return LOCALE_BY_CURRENCY[currencyCode] ?? 'en-US';
}

export function minorExponent(currencyCode: string): number {
  return (
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/** Splits integer minor units into a decimal string by moving the point, never by dividing. */
function toDecimalString(amountMinor: number | bigint, exponent: number): string {
  const negative = amountMinor < 0;
  const digits = (negative ? -BigInt(amountMinor) : BigInt(amountMinor))
    .toString()
    .padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}${exponent > 0 ? `.${fraction}` : ''}`;
}

export function formatMoney(
  amountMinor: number | bigint,
  currencyCode: string,
  options: { fraction?: boolean } = {},
): string {
  const exponent = minorExponent(currencyCode);
  const showFraction = options.fraction ?? true;
  return new Intl.NumberFormat(localeFor(currencyCode), {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: showFraction ? exponent : 0,
    maximumFractionDigits: showFraction ? exponent : 0,
  }).format(toDecimalString(amountMinor, exponent) as unknown as number);
}

/** Parses a typed amount in major units ("1,234.5") into minor units, or null when it is not one. */
export function parseMajorToMinor(text: string, currencyCode: string): number | null {
  const exponent = minorExponent(currencyCode);
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim().replaceAll(',', ''));
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) return null;
  const minor = BigInt(`${match[1]}${fraction.padEnd(exponent, '0')}`);
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

/** Parses "7.25" into 725 basis points; the API accepts 1 to 10,000. */
export function parsePercentageToBp(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text.trim());
  if (!match) return null;
  const bp = Number(`${match[1]}${(match[2] ?? '').padEnd(2, '0')}`);
  return bp >= 1 && bp <= 10_000 ? bp : null;
}

export function formatPercentageBp(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const fraction = String(bp % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}%`;
}

/** "+11.11%", "-2.5%" or "0%": a signed change in basis points. */
export function formatChangeBp(bp: number): string {
  if (bp === 0) return '0%';
  return `${bp > 0 ? '+' : '-'}${formatPercentageBp(Math.abs(bp))}`;
}

/** A money change with an explicit sign; zero carries none. */
export function formatSignedMoney(
  amountMinor: number,
  currencyCode: string,
  options: { fraction?: boolean } = {},
): string {
  if (amountMinor === 0) return formatMoney(0, currencyCode, options);
  const sign = amountMinor > 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(amountMinor), currencyCode, options)}`;
}

/** Plain-text amount for an input's default value, e.g. 9000050 USD -> "90000.50". */
export function toInputAmount(amountMinor: number, currencyCode: string): string {
  return toDecimalString(amountMinor, minorExponent(currencyCode));
}

/**
 * An amount for an editable input: grouped, always the currency's minor digits, with "," grouping
 * and "." decimal (en-IN grouping for INR) so parseMajorToMinor reads it back.
 */
export function formatInputAmount(amountMinor: number, currencyCode: string): string {
  const exponent = minorExponent(currencyCode);
  return new Intl.NumberFormat(currencyCode === 'INR' ? 'en-IN' : 'en-US', {
    style: 'decimal',
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(toDecimalString(amountMinor, exponent) as unknown as number);
}

/** Short axis label such as "$120K". The input is minor units; the point is moved, not divided. */
export function formatMoneyCompact(amountMinor: number, currencyCode: string): string {
  const exponent = minorExponent(currencyCode);
  return new Intl.NumberFormat(localeFor(currencyCode), {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toDecimalString(amountMinor, exponent) as unknown as number);
}
