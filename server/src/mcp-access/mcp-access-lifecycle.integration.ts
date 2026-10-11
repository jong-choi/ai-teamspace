import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { JobsModule } from '@/jobs/jobs.module';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { mcpUserPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.schema';
import { McpAccessMaintenanceModule } from '@/mcp-access/maintenance/mcp-access-maintenance.module';
import { McpAccessMaintenanceService } from '@/mcp-access/maintenance/mcp-access-maintenance.service';
import { McpAccessService } from '@/mcp-access/mcp-access.service';

import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import {
  type McpActor,
  McpIntegrationApp,
  type McpMember,
} from '@test/support/mcp-integration.fixture';
import { and, eq } from 'drizzle-orm';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];

describe('MCP 권한 정책 membership lifecycle 통합', () => {
  let target: McpIntegrationApp;
  let jobs: INestApplicationContext;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
    // 조직 public event를 처리하는 실제 jobs worker를 같은 test DB와 queue로 띄운다.
    jobs = await NestFactory.createApplicationContext(JobsModule, {
      abortOnError: false,
      logger: false,
    });
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await jobs.close();
    await target.close();
  });

  it('member 제거 이벤트를 jobs worker가 처리해 user policy를 지우고 재가입하면 read 기본값만 다시 만든다', async () => {
    const owner = await target.createActor({ scopes: WIKI_SCOPES });
    const member = await target.addMember(owner, { scopes: WIKI_SCOPES });
    await expect(findUserPolicy(owner, member)).resolves.toMatchObject({
      requestedScopes: ['wiki:read', 'wiki:write'],
    });

    await owner.agent
      .delete(
        `/organizations/${owner.organizationId}/members/${member.memberId}`,
      )
      .expect(204);
    await waitForCondition(
      async () => (await findUserPolicy(owner, member)) === undefined,
      'member 제거 뒤 user policy가 삭제되지 않았습니다.',
      { timeoutMs: 10_000 },
    );

    const rejoined = await target.inviteMember(owner, member);
    const access = await rejoined.agent
      .get(`/organizations/${owner.organizationId}/mcp-access`)
      .expect(200);
    expect(access.body.myPolicy.requestedScopes).toEqual(['wiki:read']);
  });

  it('같은 membership 이벤트를 반복 처리해도 결과와 revision이 바뀌지 않는다', async () => {
    const owner = await target.createActor({ scopes: WIKI_SCOPES });
    const kept = await target.addMember(owner, { scopes: WIKI_SCOPES });
    const removed = await target.addMember(owner, { scopes: WIKI_SCOPES });
    await owner.agent
      .delete(
        `/organizations/${owner.organizationId}/members/${removed.memberId}`,
      )
      .expect(204);
    const service = target.app.get(McpAccessService);
    const before = await findUserPolicy(owner, kept);

    const results = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      results.push(
        await service.handleOrganizationAuthorizationChanged({
          organizationId: owner.organizationId,
          userId: kept.userId,
          reason: 'member-role-changed',
        }),
        await service.handleOrganizationAuthorizationChanged({
          organizationId: owner.organizationId,
          userId: removed.userId,
          reason: 'member-removed',
        }),
      );
    }

    expect(results).toEqual(['ensured', 'deleted', 'ensured', 'deleted']);
    await expect(findUserPolicy(owner, kept)).resolves.toMatchObject({
      revision: before?.revision,
      requestedScopes: before?.requestedScopes,
    });
    await expect(findUserPolicy(owner, removed)).resolves.toBeUndefined();
  });

  it('policy maintenance command module도 필요한 config로 부팅된다', async () => {
    const maintenance = await NestFactory.createApplicationContext(
      McpAccessMaintenanceModule,
      { abortOnError: false, logger: false },
    );
    try {
      await expect(
        maintenance.get(McpAccessMaintenanceService).runBatch({ targets: [] }),
      ).resolves.toMatchObject({ processedTasks: 0 });
    } finally {
      await maintenance.close();
    }
  });

  async function findUserPolicy(owner: McpActor, member: McpMember) {
    const [policy] = await target.database
      .select({
        revision: mcpUserPolicy.revision,
        requestedScopes: mcpUserPolicy.requestedScopes,
      })
      .from(mcpUserPolicy)
      .where(
        and(
          eq(mcpUserPolicy.organizationId, owner.organizationId),
          eq(mcpUserPolicy.userId, member.userId),
        ),
      );
    return policy;
  }
});
