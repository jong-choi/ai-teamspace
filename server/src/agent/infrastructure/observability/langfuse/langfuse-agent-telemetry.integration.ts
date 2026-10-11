import { randomUUID } from 'node:crypto';

import type { AgentConfig } from '@/agent/config/agent-config.type';
import { LangfuseAgentTelemetryAdapter } from '@/agent/infrastructure/observability/langfuse/langfuse-agent-telemetry.adapter';
import { pseudonymizeLangfuseId } from '@/agent/infrastructure/observability/langfuse/langfuse-redaction';

import { jest } from '@jest/globals';
import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { createTraceId } from '@langfuse/tracing';
import {
  type StartedTeamspaceMcpFixture,
  startTeamspaceMcpFixture,
} from '@test/agent/fixtures/teamspace-mcp.fixture';
import {
  FixtureModelProvider,
  startAgentApp,
  unusedModel,
  waitForCondition,
} from '@test/agent/support/teamspace-agent.e2e-support';
import { z } from 'zod';

jest.setTimeout(90_000);

type LangfuseConfiguration = NonNullable<
  AgentConfig['observability']
>['langfuse'];

// Langfuse v4 Observations API v2 응답에서 이 test가 확인하는 field만 검증한다.
const langfuseObservationsSchema = z.object({
  data: z.array(
    z.object({
      traceId: z.string(),
      type: z.string(),
      name: z.string(),
      level: z.string(),
      sessionId: z.string().nullable(),
      userId: z.string().nullable(),
      isRootObservation: z.boolean(),
      input: z.unknown(),
      output: z.unknown(),
    }),
  ),
});

type LangfuseObservation = z.infer<
  typeof langfuseObservationsSchema
>['data'][number];

const langfuseBaseUrl = process.env['AGENT_TEST_LANGFUSE_BASE_URL'];
const langfusePublicKey = process.env['AGENT_TEST_LANGFUSE_PUBLIC_KEY'];
const langfuseSecretKey = process.env['AGENT_TEST_LANGFUSE_SECRET_KEY'];
const localLangfuseDescribe =
  langfuseBaseUrl && langfusePublicKey && langfuseSecretKey
    ? describe
    : describe.skip;

const ID_HASH_SECRET = 'langfuse-acceptance-id-hash-secret-0123456789';
// 연결을 받지 않는 loopback port다. Langfuse·MCP 장애 상황을 흉내 낸다.
const UNREACHABLE_LANGFUSE_URL = 'http://127.0.0.1:9';
const UNREACHABLE_MCP_URL = 'http://127.0.0.1:9/mcp';

describe('Langfuse Agent telemetry 통합', () => {
  let fixture: StartedTeamspaceMcpFixture;

  beforeAll(async () => {
    fixture = await startTeamspaceMcpFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  localLangfuseDescribe('로컬 self-hosted Langfuse', () => {
    it('Agent run trace는 runId로 찾을 수 있고 thread와 가명 user로 연결되며 원문과 credential을 남기지 않는다', async () => {
      const startedAt = new Date();
      const userId = `langfuse-acceptance-${randomUUID()}`;
      const prompt = `langfuse-prompt-canary-${randomUUID()}`;
      const telemetry = new LangfuseAgentTelemetryAdapter(
        configuration({
          baseUrl: langfuseBaseUrl,
          publicKey: langfusePublicKey,
          secretKey: langfuseSecretKey,
        }),
      );

      const { threadId, runId, status } = await runAgent(telemetry, {
        userId,
        prompt,
      });
      await telemetry.flush();
      await telemetry.shutdown();

      expect(status).toBe('success');
      const traceId = await createTraceId(runId);
      const { raw, observations } = await waitForRootObservation(
        traceId,
        startedAt,
      );
      expect(observations).toContainEqual(
        expect.objectContaining({
          isRootObservation: true,
          type: 'AGENT',
          name: 'agent-run',
        }),
      );
      expect(observations).toContainEqual(
        expect.objectContaining({ type: 'TOOL', name: 'fixture_read' }),
      );
      for (const observation of observations) {
        expect(observation).toMatchObject({
          traceId,
          sessionId: threadId,
          userId: pseudonymizeLangfuseId(userId, ID_HASH_SECRET),
        });
        // captureLevel=metadata는 input/output을 보내지 않는다.
        expect(observation.input ?? null).toBeNull();
        expect(observation.output ?? null).toBeNull();
      }
      expect(raw).toContain(runId);
      for (const forbidden of [userId, `fixture:${userId}`, prompt]) {
        expect(raw).not.toContain(forbidden);
      }
    });

    it('graph를 만들기 전에 실패한 run도 ERROR root observation으로 남는다', async () => {
      const startedAt = new Date();
      const telemetry = new LangfuseAgentTelemetryAdapter(
        configuration({
          baseUrl: langfuseBaseUrl,
          publicKey: langfusePublicKey,
          secretKey: langfuseSecretKey,
        }),
      );

      const { threadId, runId, status } = await runAgent(telemetry, {
        userId: `langfuse-failure-${randomUUID()}`,
        prompt: 'MCP 장애 중 요청',
        mcpUrl: UNREACHABLE_MCP_URL,
      });
      await telemetry.flush();
      await telemetry.shutdown();

      expect(status).toBe('error');
      const { observations } = await waitForRootObservation(
        await createTraceId(runId),
        startedAt,
      );
      expect(observations).toEqual([
        expect.objectContaining({
          isRootObservation: true,
          name: 'agent-run',
          level: 'ERROR',
          sessionId: threadId,
        }),
      ]);
    });
  });

  it('Langfuse에 연결할 수 없어도 Agent run은 성공한다', async () => {
    const telemetry = new LangfuseAgentTelemetryAdapter(
      configuration({
        baseUrl: UNREACHABLE_LANGFUSE_URL,
        publicKey: 'pk-lf-unreachable',
        secretKey: 'sk-lf-unreachable',
      }),
    );

    try {
      const { status } = await runAgent(telemetry, {
        userId: 'langfuse-outage-user',
        prompt: 'Langfuse 장애 중 요청',
      });

      expect(status).toBe('success');
    } finally {
      await telemetry.shutdown().catch(() => undefined);
    }
  });

  async function runAgent(
    telemetry: LangfuseAgentTelemetryAdapter,
    input: { userId: string; prompt: string; mcpUrl?: string },
  ) {
    const app = await startAgentApp({
      mcpUrl: input.mcpUrl ?? fixture.url,
      modelProvider: new FixtureModelProvider({
        root: fakeModel()
          .respondWithTools([
            { name: 'fixture_read', id: 'read-1', args: { query: 'alpha' } },
          ])
          .respond(new AIMessage('fixture read complete')),
        researcher: unusedModel(),
        operator: unusedModel(),
      }),
      telemetry,
    });

    try {
      const client = app.client(input.userId);
      const thread = await client.threads.create();
      const run = await client.runs.create(thread.thread_id, 'teamspace', {
        input: { messages: [{ role: 'user', content: input.prompt }] },
      });
      await client.runs.join(thread.thread_id, run.run_id);
      const finished = await client.runs.get(thread.thread_id, run.run_id);
      return {
        threadId: thread.thread_id,
        runId: run.run_id,
        status: finished.status,
      };
    } finally {
      await app.close();
    }
  }

  async function waitForRootObservation(
    traceId: string,
    startedAt: Date,
  ): Promise<{ raw: string; observations: LangfuseObservation[] }> {
    const query = new URLSearchParams({
      traceId,
      fields: 'core,basic,io,metadata',
      fromStartTime: new Date(startedAt.getTime() - 60_000).toISOString(),
      toStartTime: new Date(Date.now() + 60_000).toISOString(),
      limit: '1000',
    });
    let result: { raw: string; observations: LangfuseObservation[] } = {
      raw: '',
      observations: [],
    };
    await waitForCondition(
      async () => {
        const response = await fetch(
          `${langfuseBaseUrl}/api/public/v2/observations?${query.toString()}`,
          {
            headers: {
              authorization: `Basic ${Buffer.from(`${langfusePublicKey}:${langfuseSecretKey}`).toString('base64')}`,
            },
          },
        );
        if (!response.ok) {
          throw new Error(`Langfuse observation 조회 실패: ${response.status}`);
        }
        const raw = await response.text();
        const observations = langfuseObservationsSchema.parse(
          JSON.parse(raw),
        ).data;
        result = { raw, observations };
        // root observation은 run이 끝날 때 닫히므로 마지막에 들어온다.
        return observations.some(
          (observation) => observation.isRootObservation,
        );
      },
      'Langfuse에 Agent run root observation이 들어오지 않았습니다.',
      {
        timeoutMs: 60_000,
        pause: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
      },
    );
    return result;
  }
});

function configuration(
  endpoint: Pick<LangfuseConfiguration, 'baseUrl' | 'publicKey' | 'secretKey'>,
): LangfuseConfiguration {
  return {
    enabled: true,
    ...endpoint,
    tracingEnvironment: 'acceptance',
    sampleRate: 1,
    captureLevel: 'metadata',
    idHashSecret: ID_HASH_SECRET,
  };
}
