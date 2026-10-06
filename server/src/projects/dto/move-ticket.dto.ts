import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectColumnSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';
import { ticketSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import { z } from 'zod';

export const MoveTicketSchema = z
  .object({
    targetColumnId: projectColumnSelectSchema.shape.id,
    beforeTicketId: ticketSelectSchema.shape.id.nullable().optional(),
    afterTicketId: ticketSelectSchema.shape.id.nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.beforeTicketId && input.afterTicketId) {
      context.addIssue({
        code: 'custom',
        message: 'beforeTicketId와 afterTicketId는 동시에 지정할 수 없습니다.',
      });
    }
  })
  .meta({ id: 'MoveTicket' });

export const MoveTicketResultSchema = z
  .object({
    ticketId: ticketSelectSchema.shape.id,
    columnId: ticketSelectSchema.shape.columnId,
    position: ticketSelectSchema.shape.position,
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'MoveTicketResult' });

export type MoveTicketInput = z.infer<typeof MoveTicketSchema>;
export type MoveTicketResponse = z.infer<typeof MoveTicketResultSchema>;

export class MoveTicketDto extends createZodDto(MoveTicketSchema) {}
export class MoveTicketResultDto extends createZodDto(MoveTicketResultSchema) {}
