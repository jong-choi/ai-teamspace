import { AgentModelInfoSchema } from '@/agent/dto/agent-model.dto';

import { McpIntegrationApp } from '@test/support/mcp-integration.fixture';
import request from 'supertest';

describe('Agent 모델 정보 API', () => {
  let target: McpIntegrationApp;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await target.close();
  });

  it('로그인 사용자에게 모델과 선택 가능한 추론 수준을 돌려준다', async () => {
    const actor = await target.createActor({ scopes: ['wiki:read'] });

    const response = await actor.agent.get('/agent/model');

    expect(response.status).toBe(200);
    expect(AgentModelInfoSchema.parse(response.body)).toMatchObject({
      supportedReasoningEfforts: ['low', 'medium', 'high'],
      defaultReasoningEffort: 'high',
    });
  });

  it('로그인하지 않은 요청은 거부한다', async () => {
    const response = await request(target.app.getHttpServer()).get(
      '/agent/model',
    );

    expect(response.status).toBe(401);
  });
});
