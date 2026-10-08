import { createHash } from 'node:crypto';

export function digestGraphJson(value: object | null): string {
  return createHash('sha256').update(stableGraphJson(value)).digest('hex');
}

export function stableGraphJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableGraphJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableGraphJson(Reflect.get(value, key))}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
