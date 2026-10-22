import { z } from 'zod';
import { isoDateSchema } from './employees';

/** 1 to 10,000 basis points: a 0.01% to 100% increase. Decreases go through a correction. */
const percentageBpSchema = z.number().int().min(1).max(10_000);

const bulkFilterSchema = z
  .object({
    country: z.array(z.string().min(1)).min(1).max(100).optional(),
    department: z.array(z.number().int().positive()).min(1).max(100).optional(),
    level: z.array(z.number().int().positive()).min(1).max(100).optional(),
    search: z.string().trim().min(1).optional(),
  })
  .strict();

/** Either the list's filters or an explicit set of ids, never both. Inactive staff are skipped. */
export const bulkPreviewBodySchema = z
  .object({
    filter: bulkFilterSchema.optional(),
    employeeIds: z.array(z.number().int().positive()).max(100_000).optional(),
    percentageBp: percentageBpSchema,
  })
  .strict()
  .refine((body) => (body.filter === undefined) !== (body.employeeIds === undefined), {
    message: 'provide exactly one of filter or employeeIds',
  });

export const bulkPreviewItemSchema = z.object({
  employeeId: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  countryCode: z.string(),
  departmentName: z.string(),
  levelCode: z.string(),
  currencyCode: z.string(),
  currentAmountMinor: z.number().int(),
  proposedAmountMinor: z.number().int(),
  currentAmountBaseMinor: z.number().int(),
  proposedAmountBaseMinor: z.number().int(),
  changeBp: z.number().int(),
  outsidePeerRange: z.enum(['above', 'below']).nullable(),
});

export const bulkPreviewResponseSchema = z.object({
  items: z.array(bulkPreviewItemSchema),
  total: z.number().int(),
});

export const bulkOverrideSchema = z
  .object({
    employeeId: z.number().int().positive(),
    newAmountMinor: z.number().int().positive(),
  })
  .strict();

/** A selection, an optional percentage and the hand-edited amounts, for the headline figures. */
export const bulkSummaryBodySchema = z
  .object({
    filter: bulkFilterSchema.optional(),
    employeeIds: z.array(z.number().int().positive()).max(100_000).optional(),
    percentageBp: percentageBpSchema.optional(),
    overrides: z.array(bulkOverrideSchema).max(100_000).optional(),
  })
  .strict()
  .refine((body) => (body.filter === undefined) !== (body.employeeIds === undefined), {
    message: 'provide exactly one of filter or employeeIds',
  })
  .refine((body) => body.overrides === undefined || body.percentageBp !== undefined, {
    message: 'overrides need a percentageBp',
  })
  .refine(
    (body) =>
      new Set(body.overrides?.map((o) => o.employeeId)).size === (body.overrides?.length ?? 0),
    { message: 'an employee appears more than once' },
  );

export const bulkSummaryResponseSchema = z.object({
  headcount: z.number().int(),
  byDepartment: z.array(z.object({ departmentName: z.string(), headcount: z.number().int() })),
  revision: z
    .object({
      percentageBp: z.number().int(),
      overriddenCount: z.number().int(),
      addedByCurrency: z.array(
        z.object({ currencyCode: z.string(), addedMinor: z.number().int() }),
      ),
      addedBaseMinor: z.number().int(),
      typical: z
        .object({
          currencyCode: z.string(),
          beforeMinor: z.number().int(),
          afterMinor: z.number().int(),
        })
        .nullable(),
      overrideChangeBp: z.array(
        z.object({ employeeId: z.number().int(), changeBp: z.number().int() }),
      ),
    })
    .nullable(),
});

export const bulkConfirmBodySchema = z
  .object({
    percentageBp: percentageBpSchema,
    effectiveDate: isoDateSchema,
    note: z.string().trim().max(200),
    items: z
      .array(
        z
          .object({
            employeeId: z.number().int().positive(),
            expectedCurrentAmountMinor: z.number().int().positive(),
            newAmountMinor: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(100_000),
  })
  .strict();

export const bulkConfirmResponseSchema = z.object({
  batchId: z.number().int(),
  employeeCount: z.number().int(),
  effectiveDate: z.string(),
});

export type BulkPreviewBody = z.infer<typeof bulkPreviewBodySchema>;
export type BulkPreviewItem = z.infer<typeof bulkPreviewItemSchema>;
export type BulkPreviewResponse = z.infer<typeof bulkPreviewResponseSchema>;
export type BulkConfirmBody = z.infer<typeof bulkConfirmBodySchema>;
export type BulkConfirmResponse = z.infer<typeof bulkConfirmResponseSchema>;
export type BulkOverride = z.infer<typeof bulkOverrideSchema>;
export type BulkSummaryBody = z.infer<typeof bulkSummaryBodySchema>;
export type BulkSummary = z.infer<typeof bulkSummaryResponseSchema>;
