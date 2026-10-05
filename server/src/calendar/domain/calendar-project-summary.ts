import { z } from 'zod';

export const CalendarProjectSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
  })
  .meta({ id: 'CalendarProjectSummary' });

export type CalendarProjectSummary = z.infer<
  typeof CalendarProjectSummarySchema
>;
