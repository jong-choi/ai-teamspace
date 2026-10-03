import type { z, ZodType } from 'zod';

type ZodDtoClass<TSchema extends ZodType> = {
  new (): z.output<TSchema>;
  readonly schema: TSchema;
};

export function createZodDto<TSchema extends ZodType>(
  schema: TSchema,
): ZodDtoClass<TSchema> {
  class ZodDto {
    static readonly schema = schema;
  }

  return ZodDto as unknown as ZodDtoClass<TSchema>;
}
