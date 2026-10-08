import { authOptions } from '@/auth/auth-options';
import {
  surfaceUniqueViolations,
  UniqueConstraintViolationError,
} from '@/auth/infrastructure/persistence/drizzle/unique-violation.adapter';

import type { DBAdapter } from 'better-auth/adapters';
import { memoryAdapter } from 'better-auth/adapters/memory';

const POSTGRES_MESSAGE =
  'duplicate key value violates unique constraint "oauth_resource_identifier_unique"';

/** Drizzle이 PostgreSQL 오류를 감싸 던지는 형태다. */
function drizzleQueryError(cause: unknown): Error {
  return new Error('Failed query: insert into "oauth_resource" ...', {
    cause,
  });
}

function adapterFailingWith(error: Error): DBAdapter {
  const base = memoryAdapter({ oauthResource: [] })(authOptions);
  const fail = () => Promise.reject(error);
  const failing = { ...base, create: fail, update: fail, updateMany: fail };
  return { ...failing, transaction: (operation) => operation(failing) };
}

describe('Better Auth adapter unique 위반 노출', () => {
  it('Drizzle이 감싼 PostgreSQL unique 위반을 원래 message와 SQLSTATE로 다시 던진다', async () => {
    const original = drizzleQueryError({
      code: '23505',
      constraint: 'oauth_resource_identifier_unique',
      message: POSTGRES_MESSAGE,
    });
    const adapter = surfaceUniqueViolations(adapterFailingWith(original));

    const error = await adapter
      .create({ model: 'oauthResource', data: { identifier: 'x' } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UniqueConstraintViolationError);
    expect(error).toMatchObject({
      message: POSTGRES_MESSAGE,
      code: '23505',
      constraint: 'oauth_resource_identifier_unique',
      cause: original,
    });
  });

  it('transaction 안의 update도 같은 방식으로 노출한다', async () => {
    const adapter = surfaceUniqueViolations(
      adapterFailingWith(
        drizzleQueryError({ code: '23505', message: POSTGRES_MESSAGE }),
      ),
    );

    await expect(
      adapter.transaction((transaction) =>
        transaction.update({
          model: 'oauthResource',
          where: [{ field: 'id', value: 'x' }],
          update: { identifier: 'y' },
        }),
      ),
    ).rejects.toBeInstanceOf(UniqueConstraintViolationError);
  });

  it('unique 위반이 아닌 오류는 그대로 전파한다', async () => {
    const original = drizzleQueryError({ code: '23503' });
    const adapter = surfaceUniqueViolations(adapterFailingWith(original));

    await expect(
      adapter.create({ model: 'oauthResource', data: { identifier: 'x' } }),
    ).rejects.toBe(original);
  });
});
