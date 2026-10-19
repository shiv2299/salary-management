import type { DistributionResponse, PayrollResponse } from '@acme/shared';

type Distribution = DistributionResponse['groups'][number]['distribution'];

export interface DistributionChartRow {
  key: string;
  label: string;
  headcount: number;
  /** Invisible bar that pushes the visible segments to start at the group's minimum. */
  offset: number;
  lowerWhisker: number;
  lowerBox: number;
  upperBox: number;
  upperWhisker: number;
  stats: Distribution;
}

/** Stacks min..p25, p25..median, median..p75 and p75..max so one bar reads as a box plot. */
export function toDistributionChartRows(response: DistributionResponse): DistributionChartRow[] {
  return response.groups.map(({ key, label, distribution: d }) => ({
    key,
    label,
    headcount: d.headcount,
    offset: d.min,
    lowerWhisker: d.p25 - d.min,
    lowerBox: d.median - d.p25,
    upperBox: d.p75 - d.median,
    upperWhisker: d.max - d.p75,
    stats: d,
  }));
}

export interface PayrollChartRow {
  key: string;
  label: string;
  headcount: number;
  totalBaseMinor: number;
}

export function toPayrollChartRows(response: PayrollResponse): PayrollChartRow[] {
  return response.groups.map(({ key, label, headcount, totalBaseMinor }) => ({
    key,
    label,
    headcount,
    totalBaseMinor,
  }));
}
