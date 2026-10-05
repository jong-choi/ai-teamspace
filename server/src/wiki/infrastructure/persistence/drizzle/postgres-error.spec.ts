import { isPostgresConstraintViolation } from '#server/wiki/infrastructure/persistence/drizzle/postgres-error.js';

describe('PostgreSQL constraint 오류 판별', () => {
  it('Drizzle cause 체인 안의 PostgreSQL 오류를 찾는다', () => {
    const error = new Error('query failed', {
      cause: {
        code: '23505',
        constraint: 'wiki_entry_organization_parent_name_unique',
      },
    });

    expect(
      isPostgresConstraintViolation(
        error,
        '23505',
        'wiki_entry_organization_parent_name_unique',
      ),
    ).toBe(true);
  });

  it('constraint 이름이 다르면 같은 SQLSTATE라도 일치시키지 않는다', () => {
    expect(
      isPostgresConstraintViolation(
        {
          code: '23503',
          constraint: 'some_other_foreign_key',
        },
        '23503',
        'wiki_entry_parent_folder_id_wiki_entry_id_fk',
      ),
    ).toBe(false);
  });

  it('순환 cause가 있어도 종료한다', () => {
    const error: { code?: string; cause?: unknown } = { code: 'other' };
    error.cause = error;

    expect(isPostgresConstraintViolation(error, '23505')).toBe(false);
  });
});
