export function isPostgresConstraintViolation(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  let current: unknown = error;
  const visited = new Set<object>();

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === code &&
      (constraint === undefined || candidate.constraint === constraint)
    ) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}
