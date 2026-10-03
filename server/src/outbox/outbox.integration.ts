import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { Test } from '@nestjs/testing';

import { OutboxInfrastructureModule } from '#server-source/outbox/outbox.module';

describe('Transactional Outbox 통합', () => {
  it('Drizzle migration으로 준비한 Outbox schema를 검증한다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OutboxInfrastructureModule],
    }).compile();

    try {
      await moduleRef.init();

      expect(moduleRef.get(PostgresOutboxStore)).toBeInstanceOf(
        PostgresOutboxStore,
      );
      expect(PostgresOutboxStore.schemaVersion).toBeGreaterThan(0);
    } finally {
      await moduleRef.close();
    }
  });

  it('Drizzle custom migration이 설치된 Outbox package schema와 일치한다', async () => {
    const migrationPath = resolve(
      process.cwd(),
      'drizzle/0001_nestjs_outbox.sql',
    );
    const migrationSql = await readFile(migrationPath, 'utf8');
    const packageSql = PostgresOutboxStore.migrationSql({
      statementBreakpoints: true,
    });

    expect(migrationSql.trim()).toBe(packageSql.trim());
  });
});
