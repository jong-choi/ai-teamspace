import type { ZodType } from 'zod';

export default function validateConfig<T>(
  config: unknown,
  schema: ZodType<T>,
): T {
  return schema.parse(config);
}
