import { jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { startWorkOsMcpFixture } from '@test/agent/fixtures/workos-mcp.fixture';
import {
  FixtureModelProvider,
  startAgentApp,
  unusedModel,
  waitForCondition,
  waitForRunStatus,
} from '@test/agent/support/workos-agent.e2e-support';

const stressEnabled = process.env['AGENT_STRESS_ACCEPTANCE'] === 'true';
const stressDescribe = stressEnabled ? describe : describe.skip;
const stressIterations = parseStressIterations(
  process.env['AGENT_STRESS_ITERATIONS'],
);
const stressSeed =
  process.env['AGENT_STRESS_SEED']?.trim() || 'workos-agent-stress-v1';

jest.setTimeout(120_000);

stressDescribe('WorkOS Agent 반복 stress acceptance', () => {
  test(`HITL interrupt/resume을 반복해도 write가 정확히 한 번씩 실행된다 (seed=${stressSeed}, iterations=${stressIterations})`, async () => {
    const fixture = await startWorkOsMcpFixture();
    const root = fakeModel();
    const operator = fakeModel();

    for (let index = 0; index < stressIterations; index += 1) {
      root
        .respondWithTools([
          {
            name: 'task',
            id: `stress-task-${index}`,
            args: {
              description: `stress write ${stressSeed}-${index}`,
              subagent_type: 'operator',
            },
          },
        ])
        .respond(new AIMessage(`stress root complete ${index}`));
      operator
        .respondWithTools([
          {
            name: 'fixture_write',
            id: `stress-write-${index}`,
            args: { value: `${stressSeed}-write-${index}` },
          },
        ])
        .respond(new AIMessage(`stress operator complete ${index}`));
    }

    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher: unusedModel(),
        operator,
      }),
    });

    try {
      const client = app.client('stress-user');
      for (let index = 0; index < stressIterations; index += 1) {
        const thread = await client.threads.create();
        const interrupted = await client.runs.create(
          thread.thread_id,
          'workos',
          {
            input: {
              messages: [
                {
                  role: 'user',
                  content: `stress interrupt ${stressSeed}-${index}`,
                },
              ],
            },
          },
        );
        await waitForRunStatus(
          client,
          thread.thread_id,
          interrupted.run_id,
          'interrupted',
        );

        const resumed = await client.runs.create(thread.thread_id, 'workos', {
          command: { resume: { decisions: [{ type: 'approve' }] } },
        });
        await waitForRunStatus(
          client,
          thread.thread_id,
          resumed.run_id,
          'success',
        );
        expect(fixture.state.writes).toHaveLength(index + 1);
      }

      expect(fixture.state.writes).toEqual(
        Array.from({ length: stressIterations }, (_, index) => ({
          actor: 'stress-user',
          value: `${stressSeed}-write-${index}`,
        })),
      );
    } finally {
      await app.close();
      await fixture.close();
    }
  });

  test(`MCP 실행 중 cancel을 반복해도 매 run이 실제 AbortSignal로 중단된다 (seed=${stressSeed}, iterations=${stressIterations})`, async () => {
    const fixture = await startWorkOsMcpFixture();
    const root = fakeModel();
    for (let index = 0; index < stressIterations; index += 1) {
      root.respondWithTools([
        {
          name: 'fixture_wait',
          id: `stress-wait-${index}`,
          args: { milliseconds: 5_000 },
        },
      ]);
    }

    const app = await startAgentApp({
      mcpUrl: fixture.url,
      modelProvider: new FixtureModelProvider({
        root,
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
    });

    try {
      const client = app.client('stress-user');
      for (let index = 0; index < stressIterations; index += 1) {
        const thread = await client.threads.create();
        const run = await client.runs.create(thread.thread_id, 'workos', {
          input: {
            messages: [
              { role: 'user', content: `stress cancel ${stressSeed}-${index}` },
            ],
          },
        });
        await waitForRunStatus(client, thread.thread_id, run.run_id, 'running');
        await waitForCondition(
          () => fixture.state.waits.length === index + 1,
          `stress wait tool ${index}가 시작되지 않았습니다.`,
          { timeoutMs: 2_000 },
        );

        await client.runs.cancel(thread.thread_id, run.run_id, true);
        await waitForRunStatus(
          client,
          thread.thread_id,
          run.run_id,
          'cancelled',
        );
        await waitForCondition(
          () => fixture.state.waits[index]?.cancelled === true,
          `stress cancel ${index}가 MCP AbortSignal까지 전달되지 않았습니다.`,
          { timeoutMs: 2_000 },
        );
      }

      expect(fixture.state.waits).toHaveLength(stressIterations);
      expect(fixture.state.waits.every((entry) => entry.cancelled)).toBe(true);
    } finally {
      await app.close();
      await fixture.close();
    }
  });
});

function parseStressIterations(raw: string | undefined): number {
  if (!raw) return 10;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error(
      'AGENT_STRESS_ITERATIONS는 1 이상 50 이하 정수여야 합니다.',
    );
  }
  return parsed;
}
