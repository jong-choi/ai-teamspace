import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketChecklistItemUpdateSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod';

import { z } from 'zod';

export const UpdateTicketChecklistItemSchema = ticketChecklistItemUpdateSchema
  .pick({ title: true, completed: true })
  .refine(
    (input) =>
      Number(input.title !== undefined) +
        Number(input.completed !== undefined) ===
      1,
    '체크리스트 항목은 이름 변경 또는 완료 상태 변경 중 하나만 요청할 수 있습니다.',
  )
  .meta({ id: 'UpdateTicketChecklistItem' });

export type UpdateTicketChecklistItemInput = z.infer<
  typeof UpdateTicketChecklistItemSchema
>;

export class UpdateTicketChecklistItemDto extends createZodDto(
  UpdateTicketChecklistItemSchema,
) {}
