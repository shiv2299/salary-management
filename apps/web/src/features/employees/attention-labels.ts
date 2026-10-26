import type { Attention } from '@acme/shared';

/** What each needs-attention value is called wherever the HR Manager sees it. */
export const ATTENTION_LABELS: Record<Attention, string> = {
  'outlier-above': 'Paid above peer range',
  'outlier-below': 'Paid below peer range',
  'no-raise-2y': 'No raise in over 2 years',
  compression: 'Paid less than new hires',
};
