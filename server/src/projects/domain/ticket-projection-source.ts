import { ticketSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.zod';
import { ticketChecklistSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod';
import { ticketChecklistItemSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod';
import { ticketLabelSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

import type { z } from 'zod';

export const TicketProjectionSourceSchema = ticketSelectSchema
  .pick({
    id: true,
    organizationId: true,
    projectId: true,
    columnId: true,
    number: true,
    title: true,
    priority: true,
    assigneeUserId: true,
    reporterUserId: true,
    position: true,
    dueAt: true,
    archivedAt: true,
    updatedAt: true,
  })
  .extend({
    labels: ticketLabelSelectSchema
      .pick({ id: true, projectId: true, name: true, color: true })
      .array(),
    checklists: ticketChecklistSelectSchema
      .pick({ id: true, title: true, position: true })
      .extend({
        items: ticketChecklistItemSelectSchema
          .pick({
            id: true,
            checklistId: true,
            title: true,
            completed: true,
            position: true,
          })
          .array(),
      })
      .array(),
  });
export type TicketProjectionSource = z.infer<
  typeof TicketProjectionSourceSchema
>;
