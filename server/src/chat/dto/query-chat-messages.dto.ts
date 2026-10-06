import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const QueryChatMessagesSchema = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type QueryChatMessagesInput = z.infer<typeof QueryChatMessagesSchema>;

export class QueryChatMessagesDto extends createZodDto(
  QueryChatMessagesSchema,
) {}
