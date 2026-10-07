import { createHmac } from 'node:crypto';

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const CIRCULAR = '[CIRCULAR]';

const SENSITIVE_KEY_PATTERN =
  /(?:^|[_-])(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|auth|bearer|cookie|set[_-]?cookie|credential|password|secret|client[_-]?secret|authorization[_-]?code|oauth[_-]?code|pkce[_-]?verifier|oauth[_-]?state|discovery[_-]?state|personal[_-]?access[_-]?key|user[_-]?id|organization[_-]?id|org[_-]?id)(?:$|[_-])/i;

const INLINE_SECRET_PATTERN =
  /((?:bearer\s+)|(?:(?:access|refresh|id)[_-]?token|api[_-]?key|client[_-]?secret|authorization|cookie|set-cookie|password|credential|pkce[_-]?verifier|oauth[_-]?state)\s*[:=]\s*["']?)[^"'\s,;&]+/gi;

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function sanitizeString(value: string, maxLength: number): string {
  const withoutInlineSecrets = value.replace(
    INLINE_SECRET_PATTERN,
    (_match, prefix: string) => `${prefix}${REDACTED}`,
  );
  const withoutUrlSecrets = withoutInlineSecrets.replace(URL_PATTERN, (url) =>
    sanitizeUrl(url),
  );

  if (withoutUrlSecrets.length <= maxLength) return withoutUrlSecrets;
  return `${withoutUrlSecrets.slice(0, maxLength)}${TRUNCATED}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function redactLangfuseValue(
  value: unknown,
  options: {
    maxDepth?: number;
    maxArrayLength?: number;
    maxObjectKeys?: number;
    maxStringLength?: number;
  } = {},
): unknown {
  const maxDepth = options.maxDepth ?? 5;
  const maxArrayLength = options.maxArrayLength ?? 32;
  const maxObjectKeys = options.maxObjectKeys ?? 64;
  const maxStringLength = options.maxStringLength ?? 1_000;
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): unknown => {
    if (current === null || current === undefined) return current;
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          const parsed = JSON.parse(current) as unknown;
          const sanitizedJson = JSON.stringify(visit(parsed, depth + 1));
          return sanitizeString(sanitizedJson, maxStringLength);
        } catch {
          // JSON처럼 보이지만 유효하지 않은 일반 문자열은 아래 문자열 redaction으로 처리한다.
        }
      }
      return sanitizeString(current, maxStringLength);
    }
    if (
      typeof current === 'number' ||
      typeof current === 'boolean' ||
      typeof current === 'bigint'
    ) {
      return current;
    }
    if (current instanceof Date) return current.toISOString();
    if (depth >= maxDepth) return TRUNCATED;

    if (Array.isArray(current)) {
      if (seen.has(current)) return CIRCULAR;
      seen.add(current);
      const result = current
        .slice(0, maxArrayLength)
        .map((item) => visit(item, depth + 1));
      if (current.length > maxArrayLength) result.push(TRUNCATED);
      return result;
    }

    if (!isPlainObject(current)) {
      return Object.prototype.toString.call(current);
    }
    if (seen.has(current)) return CIRCULAR;
    seen.add(current);

    const result: Record<string, unknown> = {};
    const entries = Object.entries(current).slice(0, maxObjectKeys);
    for (const [key, nested] of entries) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : visit(nested, depth + 1);
    }
    if (Object.keys(current).length > maxObjectKeys) {
      result.__truncated__ = true;
    }
    return result;
  };

  return visit(value, 0);
}

export function pseudonymizeLangfuseId(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}
