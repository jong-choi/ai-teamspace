import { projectSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project.zod';
import { ticketLabelSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

import type { z } from 'zod';

export const TicketLabelProjectionSourceSchema = ticketLabelSelectSchema
  .pick({ id: true, projectId: true, name: true, color: true, updatedAt: true })
  .extend({ organizationId: projectSelectSchema.shape.organizationId });
export type TicketLabelProjectionSource = z.infer<
  typeof TicketLabelProjectionSourceSchema
>;
