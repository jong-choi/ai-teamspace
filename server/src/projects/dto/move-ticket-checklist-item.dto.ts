import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketChecklistItemSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod';

import { z } from 'zod';

export const MoveTicketChecklistItemSchema = z
  .object({
    beforeItemId: ticketChecklistItemSelectSchema.shape.id
      .nullable()
      .optional(),
    afterItemId: ticketChecklistItemSelectSchema.shape.id.nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.beforeItemId && input.afterItemId) {
      context.addIssue({
        code: 'custom',
        message: 'beforeItemId와 afterItemId는 동시에 지정할 수 없습니다.',
      });
    }
  })
  .meta({ id: 'MoveTicketChecklistItem' });

export const MoveTicketChecklistItemResultSchema = z
  .object({
    itemId: ticketChecklistItemSelectSchema.shape.id,
    checklistId: ticketChecklistItemSelectSchema.shape.checklistId,
    position: ticketChecklistItemSelectSchema.shape.position,
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'MoveTicketChecklistItemResult' });

export type MoveTicketChecklistItemInput = z.infer<
  typeof MoveTicketChecklistItemSchema
>;
export type MoveTicketChecklistItemResponse = z.infer<
  typeof MoveTicketChecklistItemResultSchema
>;

export class MoveTicketChecklistItemDto extends createZodDto(
  MoveTicketChecklistItemSchema,
) {}
export class MoveTicketChecklistItemResultDto extends createZodDto(
  MoveTicketChecklistItemResultSchema,
) {}
