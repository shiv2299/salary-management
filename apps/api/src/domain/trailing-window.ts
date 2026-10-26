function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The first date of a window covering the last `years` whole years up to `today` (`yyyy-mm-dd`).
 * A 29 February start that lands in a non-leap year becomes 28 February.
 */
export function trailingWindowStart(today: string, years: number): string {
  const year = Number(today.slice(0, 4)) - years;
  const monthDay = today.slice(5);
  const day = monthDay === '02-29' && !isLeapYear(year) ? '02-28' : monthDay;
  return `${String(year).padStart(4, '0')}-${day}`;
}

export interface DateWindow {
  /** Exclusive. */
  after: string;
  /** Inclusive. */
  through: string;
}

/** The last 12 months: the dates after a year ago, up to and including today. */
export function trailingYear(today: string): DateWindow {
  return { after: trailingWindowStart(today, 1), through: today };
}

/** The 12 months before the last 12 months. */
export function previousTrailingYear(today: string): DateWindow {
  return { after: trailingWindowStart(today, 2), through: trailingWindowStart(today, 1) };
}

/** Whether `date` is after the window's start and on or before its end. */
export function isWithin(date: string, window: DateWindow): boolean {
  return date > window.after && date <= window.through;
}
