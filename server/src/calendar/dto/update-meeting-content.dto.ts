import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const UpdateMeetingAgendaSchema = z
  .object({ agendaMarkdown: z.string() })
  .meta({ id: 'UpdateMeetingAgenda' });

export const UpdateMeetingNotesSchema = z
  .object({ notesMarkdown: z.string() })
  .meta({ id: 'UpdateMeetingNotes' });

export type UpdateMeetingAgendaInput = z.infer<
  typeof UpdateMeetingAgendaSchema
>;
export type UpdateMeetingNotesInput = z.infer<typeof UpdateMeetingNotesSchema>;

export class UpdateMeetingAgendaDto extends createZodDto(
  UpdateMeetingAgendaSchema,
) {}
export class UpdateMeetingNotesDto extends createZodDto(
  UpdateMeetingNotesSchema,
) {}
