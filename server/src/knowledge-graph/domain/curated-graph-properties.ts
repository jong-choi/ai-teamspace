import { z } from 'zod';

const propertyScalarSchema = z.union([
  z.string().max(4_096),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const CuratedGraphPropertiesSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    z.union([propertyScalarSchema, propertyScalarSchema.array().max(64)]),
  )
  .superRefine((properties, context) => {
    if (Object.keys(properties).length > 64) {
      context.addIssue({
        code: 'custom',
        message: '그래프 속성은 최대 64개까지 저장할 수 있습니다.',
      });
    }
    if (
      new TextEncoder().encode(JSON.stringify(properties)).byteLength > 16_384
    ) {
      context.addIssue({
        code: 'custom',
        message: '그래프 속성은 UTF-8 기준 16KiB 이하여야 합니다.',
      });
    }
  });
