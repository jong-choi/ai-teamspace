import type { DBAdapter, DBTransactionAdapter } from 'better-auth/adapters';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const MAX_CAUSE_DEPTH = 4;

/**
 * PostgreSQL unique 위반을 원래 message와 SQLSTATE가 보이는 오류로 다시 던진다.
 *
 * Drizzle은 PostgreSQL 오류를 `Failed query: ...` message로 감싸고 원래 오류를 `cause`에만 둔다.
 * Better Auth는 동시 insert를 message의 unique/duplicate 문구로 판정하는 경로가 있어
 * (예: OAuth resource seed) 여러 process가 동시에 시작하면 정상 경쟁을 init 실패로 처리한다.
 */
export class UniqueConstraintViolationError extends Error {
  readonly code = POSTGRES_UNIQUE_VIOLATION;

  constructor(
    message: string,
    readonly constraint: string | undefined,
    options: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UniqueConstraintViolationError';
  }
}

export function surfaceUniqueViolations(adapter: DBAdapter): DBAdapter {
  return {
    ...surfaceInAdapter(adapter),
    transaction: (operation) =>
      adapter.transaction((transaction) =>
        operation(surfaceInAdapter(transaction)),
      ),
  };
}

function surfaceInAdapter(adapter: DBTransactionAdapter): DBTransactionAdapter {
  return {
    ...adapter,
    create: (input) => rethrowUniqueViolation(() => adapter.create(input)),
    update: (input) => rethrowUniqueViolation(() => adapter.update(input)),
    updateMany: (input) =>
      rethrowUniqueViolation(() => adapter.updateMany(input)),
  };
}

async function rethrowUniqueViolation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const violation = findUniqueViolation(error);
    if (!violation) throw error;
    throw new UniqueConstraintViolationError(
      violation.message,
      violation.constraint,
      { cause: error },
    );
  }
}

function findUniqueViolation(
  error: unknown,
): { message: string; constraint: string | undefined } | undefined {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    if ('code' in current && current.code === POSTGRES_UNIQUE_VIOLATION) {
      return {
        message:
          'message' in current && typeof current.message === 'string'
            ? current.message
            : 'duplicate key value violates unique constraint',
        constraint:
          'constraint' in current && typeof current.constraint === 'string'
            ? current.constraint
            : undefined,
      };
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}
