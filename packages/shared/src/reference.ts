import { z } from 'zod';

export const countrySchema = z.object({
  code: z.string(),
  name: z.string(),
  currencyCode: z.string(),
});

export const departmentSchema = z.object({ id: z.number().int(), name: z.string() });

export const levelSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  label: z.string(),
  rank: z.number().int(),
});

export const fxRatesSchema = z.object({
  baseCurrency: z.string(),
  rates: z.array(
    z.object({
      currencyCode: z.string(),
      asOfDate: z.string(),
      rateToBaseNano: z.number().int(),
    }),
  ),
});

export const fxConvertQuerySchema = z.object({
  amountMinor: z.coerce.number().int().min(0),
  from: z.string().length(3),
  to: z.string().length(3),
});

export const fxConvertResponseSchema = z.object({
  amountMinor: z.number().int(),
  currencyCode: z.string(),
});

export type Country = z.infer<typeof countrySchema>;
export type Department = z.infer<typeof departmentSchema>;
export type Level = z.infer<typeof levelSchema>;
export type FxRates = z.infer<typeof fxRatesSchema>;
export type FxConvertResponse = z.infer<typeof fxConvertResponseSchema>;
