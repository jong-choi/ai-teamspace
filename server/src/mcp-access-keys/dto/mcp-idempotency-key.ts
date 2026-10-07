import { z } from 'zod';

export const McpIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7E]+$/, 'Idempotency-Key는 표시 가능한 ASCII여야 합니다.');

export function parseMcpIdempotencyKey(value: string | undefined): string {
  return McpIdempotencyKeySchema.parse(value);
}
