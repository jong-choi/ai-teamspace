import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

import { z } from 'zod';

export function ApiZodQuery(schema: z.ZodObject): MethodDecorator {
  const jsonSchema = resolveObjectSchema(
    schema.toJSONSchema({ target: 'draft-07' }),
  );
  const required = new Set(jsonSchema.required ?? []);
  const properties = jsonSchema.properties ?? {};
  const decorators = Object.entries(properties).map(([name, property]) =>
    createQueryDecorator(name, property, required.has(name)),
  );

  return applyDecorators(...decorators);
}

function resolveObjectSchema(
  schema: z.core.JSONSchema.JSONSchema,
): z.core.JSONSchema.JSONSchema {
  if (schema.properties) {
    return schema;
  }

  const reference = schema.$ref;
  const definitions = schema['definitions'];
  if (!reference?.startsWith('#/definitions/') || !isRecord(definitions)) {
    return schema;
  }

  const definitionName = reference.slice('#/definitions/'.length);
  const definition = definitions[definitionName];
  return isJsonSchema(definition) ? definition : schema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonSchema(value: unknown): value is z.core.JSONSchema.JSONSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createQueryDecorator(
  name: string,
  property: z.core.JSONSchema._JSONSchema,
  required: boolean,
): MethodDecorator {
  if (typeof property === 'boolean') {
    throw new Error(
      `ApiZodQuery는 boolean JSON Schema를 지원하지 않습니다: ${name}`,
    );
  }

  const common = {
    name,
    required,
    ...(typeof property.description === 'string'
      ? { description: property.description }
      : {}),
  };

  switch (property.type) {
    case 'boolean':
      return ApiQuery({ ...common, type: 'boolean' });
    case 'integer':
      return ApiQuery({
        ...common,
        type: 'integer',
        ...(typeof property.minimum === 'number'
          ? { minimum: property.minimum }
          : {}),
        ...(typeof property.maximum === 'number'
          ? { maximum: property.maximum }
          : {}),
      });
    case 'number':
      return ApiQuery({
        ...common,
        type: 'number',
        ...(typeof property.minimum === 'number'
          ? { minimum: property.minimum }
          : {}),
        ...(typeof property.maximum === 'number'
          ? { maximum: property.maximum }
          : {}),
      });
    case 'string':
      return ApiQuery({
        ...common,
        type: 'string',
        ...(typeof property.format === 'string'
          ? { format: property.format }
          : {}),
        ...(typeof property.pattern === 'string'
          ? { pattern: property.pattern }
          : {}),
        ...(typeof property.minLength === 'number'
          ? { minLength: property.minLength }
          : {}),
        ...(typeof property.maxLength === 'number'
          ? { maxLength: property.maxLength }
          : {}),
        ...(isSwaggerEnum(property.enum) ? { enum: property.enum } : {}),
      });
    default:
      throw new Error(
        `ApiZodQuery가 지원하지 않는 query schema입니다: ${name} (${String(property.type)})`,
      );
  }
}

function isSwaggerEnum(value: unknown): value is Array<string | number> {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' || typeof item === 'number')
  );
}
