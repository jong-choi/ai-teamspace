import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { startTeamspaceMcpProcessFixture } from '@test/agent/fixtures/teamspace-mcp-process.fixture';
import { deleteRedisTestKeys } from '@test/support/redis-test-keys';

const redisUrl = process.env['AGENT_TEST_REDIS_URL'];
const processAcceptanceEnabled =
  process.env['AGENT_REAL_PROCESS_ACCEPTANCE'] === 'true' &&
  Boolean(process.env['DATABASE_URL']) &&
  Boolean(redisUrl);
const processDescribe = processAcceptanceEnabled ? describe : describe.skip;

jest.setTimeout(60_000);

interface ProcessResult {
  phase: 'interrupt' | 'resume';
  threadId: string;
  runId: string;
  hasFinalState?: boolean;
}

processDescribe('AI Teamspace Agent real-process durable acceptance', () => {
  test('process A의 persisted nested HITL을 종료 뒤 process B가 resume해 write를 한 번만 실행한다', async () => {
    const childPath = resolve(
      process.cwd(),
      'test/agent/process/teamspace-agent-process-child.mjs',
    );
    const requiredDist = resolve(
      process.cwd(),
      'dist/agent/infrastructure/deep-agent/deep-agent-teamspace-graph.adapter.js',
    );
    if (!existsSync(requiredDist)) {
      throw new Error(
        'real-process acceptance 전에 server build가 필요합니다: npm run build --workspace @repo/server',
      );
    }

    const fixture = await startTeamspaceMcpProcessFixture();
    const namespace = randomUUID();

    try {
      const interrupted = await runAgentProcess(childPath, {
        AGENT_PROCESS_PHASE: 'interrupt',
        AGENT_PROCESS_NAMESPACE: namespace,
        AGENT_PROCESS_MCP_URL: fixture.url,
      });
      expect(interrupted.phase).toBe('interrupt');
      expect(fixture.writes).toHaveLength(0);

      const resumed = await runAgentProcess(childPath, {
        AGENT_PROCESS_PHASE: 'resume',
        AGENT_PROCESS_NAMESPACE: namespace,
        AGENT_PROCESS_MCP_URL: fixture.url,
        AGENT_PROCESS_THREAD_ID: interrupted.threadId,
      });
      expect(resumed.phase).toBe('resume');
      expect(resumed.threadId).toBe(interrupted.threadId);
      expect(resumed.runId).not.toBe(interrupted.runId);
      expect(resumed.hasFinalState).toBe(true);
      expect(fixture.writes).toEqual([
        {
          actor: 'user-a',
          organizationId: 'organization-a',
          documentId: 'document-a',
          title: 'process-approved',
        },
      ]);
    } finally {
      await fixture.close();
      // child process가 만든 이 test namespace의 Redis key만 정리한다.
      if (redisUrl) {
        await deleteRedisTestKeys(redisUrl, [
          `teamspace:test:agent-process:${namespace}:*`,
          `bull:teamspace-test-agent-process-${namespace}*`,
        ]);
      }
    }
  });
});

async function runAgentProcess(
  childPath: string,
  overrides: Record<string, string>,
): Promise<ProcessResult> {
  const child = spawn(process.execPath, [childPath], {
    cwd: process.cwd(),
    env: { ...process.env, ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout = boundedAppend(stdout, chunk);
  });
  child.stderr.on('data', (chunk: string) => {
    stderr = boundedAppend(stderr, chunk);
  });

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error('real-process Agent child가 20초 안에 종료되지 않았습니다.'),
      );
    }, 20_000);
    timer.unref();

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolveExit(code ?? -1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(
      `real-process Agent child 실패(exit=${exitCode}): ${stderr || stdout}`,
    );
  }

  const resultLine = stdout
    .split('\n')
    .find((line) => line.startsWith('AGENT_PROCESS_RESULT='));
  if (!resultLine) {
    throw new Error(
      `real-process Agent child 결과 marker가 없습니다: ${stdout}`,
    );
  }

  return JSON.parse(
    resultLine.slice('AGENT_PROCESS_RESULT='.length),
  ) as ProcessResult;
}

function boundedAppend(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length <= 32_000 ? next : next.slice(next.length - 32_000);
}
