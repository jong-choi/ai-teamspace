import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assertKnowledgeGraphTestEnvironment } from '@/knowledge-graph/testing/knowledge-graph-test-database';

import { beforeAll } from '@jest/globals';
import { Client } from 'pg';

const run = promisify(execFile);

// Redis 장애 시험은 docker pause 후 finally에서 unpause하지만 강제 종료되면 멈춘 채 남아
// 다음 실행의 BullMQ가 모두 응답을 기다린다. 시작 시 일시정지된 검증 Redis를 되살린다.
async function resumePausedRedis(): Promise<void> {
  const container = process.env.KG_TEST_REDIS_CONTAINER;
  if (!container) return;
  const { stdout } = await run('docker', [
    'inspect',
    '--format',
    '{{.State.Paused}}',
    container,
  ]);
  if (stdout.trim() === 'true') await run('docker', ['unpause', container]);
}

// 강제 종료된 이전 실행이나 앞 suite의 정리 누락은 전역 관찰 suite를 오염시킨다.
// 각 test file 시작 시 전용 검증 DB의 업무 데이터를 비워 같은 빈 상태에서 출발하게 한다.
// migration 기록(drizzle)과 outbox migration seed는 남긴다.
beforeAll(async () => {
  if (process.env.KG_TEST_ALLOW_WRITE !== '1') return;
  assertKnowledgeGraphTestEnvironment();
  await resumePausedRedis();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `select format('%I.%I', schemaname, tablename) as name
         from pg_tables
        where schemaname in ('public', 'nest_outbox')
          and not (schemaname = 'nest_outbox' and tablename = 'migrations')`,
    );
    if (rows.length)
      await client.query(
        `truncate ${rows.map(({ name }) => name).join(', ')} restart identity cascade`,
      );
  } finally {
    await client.end();
  }
});
