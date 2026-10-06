import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketLabelUpdateSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

import { z } from 'zod';

export const UpdateTicketLabelSchema = ticketLabelUpdateSchema
  .pick({ name: true, color: true })
  .refine(
    (input) => input.name !== undefined || input.color !== undefined,
    '수정할 라벨 필드가 필요합니다.',
  )
  .meta({ id: 'UpdateTicketLabel' });

export type UpdateTicketLabelInput = z.infer<typeof UpdateTicketLabelSchema>;

export class UpdateTicketLabelDto extends createZodDto(
  UpdateTicketLabelSchema,
) {}
