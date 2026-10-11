import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { apikey } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { JobsModule } from '@/jobs/jobs.module';
import {
  MCP_ACCESS_KEY_RECONCILIATION_JOB,
  MCP_ACCESS_KEY_RECONCILIATION_QUEUE,
  MCP_ACCESS_KEY_RECONCILIATION_SCHEDULER_ID,
} from '@/jobs/mcp-access-key-reconciliation.job';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { mcpAccessKeyAllocation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-allocation.schema';
import { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';
import { McpAccessKeyReconciliationService } from '@/mcp-access-keys/mcp-access-key-reconciliation.service';

import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import {
  type McpActor,
  McpIntegrationApp,
} from '@test/support/mcp-integration.fixture';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';

const SCOPES: readonly McpScope[] = ['wiki:read'];
const DAY_MS = 24 * 60 * 60 * 1_000;

describe('MCP access key reconciliation 반복 job 통합', () => {
  let target: McpIntegrationApp;
  let jobs: INestApplicationContext;
  let queue: Queue;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
    jobs = await NestFactory.createApplicationContext(JobsModule, {
      abortOnError: false,
      logger: false,
    });
    queue = jobs.get(getQueueToken(MCP_ACCESS_KEY_RECONCILIATION_QUEUE));
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await jobs.close();
    await target.close();
  });

  it('jobs worker는 설정한 주기로 reconciliation scheduler를 등록한다', async () => {
    await expect(
      queue.getJobScheduler(MCP_ACCESS_KEY_RECONCILIATION_SCHEDULER_ID),
    ).resolves.toMatchObject({
      name: MCP_ACCESS_KEY_RECONCILIATION_JOB,
      every: target.mcpConfig.accessKey.reconciliationIntervalSeconds * 1_000,
    });
  });

  it('job 실행은 stale reservation과 삭제된 key의 allocation을 비우고 allocation 없는 key를 복구하며 다시 실행해도 바꾸지 않는다', async () => {
    const crashedCreate = await target.createActor({ scopes: SCOPES });
    const crashedRevoke = await target.createActor({ scopes: SCOPES });
    const staleReservationId = await leaveStaleReservation(crashedCreate);
    // allocation row 유실을 흉내 내도록 actor key의 allocation을 지운다.
    await target.database
      .delete(mcpAccessKeyAllocation)
      .where(eq(mcpAccessKeyAllocation.betterAuthKeyId, crashedCreate.keyId));
    // Better Auth key 삭제 뒤 allocation 해제 전에 멈춘 revoke를 흉내 낸다.
    await target.database
      .delete(apikey)
      .where(eq(apikey.id, crashedRevoke.keyId));

    await queue.add(MCP_ACCESS_KEY_RECONCILIATION_JOB, {});
    await waitForCondition(
      async () => {
        const [created, revoked] = await Promise.all([
          allocationsOf(crashedCreate),
          allocationsOf(crashedRevoke),
        ]);
        return (
          revoked.length === 0 &&
          created.length === 1 &&
          created[0]?.betterAuthKeyId === crashedCreate.keyId &&
          created[0].state === 'active'
        );
      },
      'reconciliation job이 coordination 상태를 정리하지 않았습니다.',
      { timeoutMs: 15_000 },
    );
    const settled = await allocationsOf(crashedCreate);
    expect(settled.map((allocation) => allocation.id)).not.toContain(
      staleReservationId,
    );

    await jobs.get(McpAccessKeyReconciliationService).reconcileAllUsers();

    await expect(allocationsOf(crashedCreate)).resolves.toEqual(settled);
    await expect(allocationsOf(crashedRevoke)).resolves.toEqual([]);
  });

  async function leaveStaleReservation(actor: McpActor): Promise<string> {
    const reservation = await target.app
      .get(McpAccessKeyCoordinationRepository)
      .reserveAllocation(
        actor.userId,
        target.mcpConfig.accessKey.maxActivePerUser,
      );
    if (!reservation) throw new Error('test reservation을 만들지 못했습니다.');
    // crash로 남은 reservation을 흉내 내도록 갱신 시각을 stale 기준보다 과거로 옮긴다.
    await target.database
      .update(mcpAccessKeyAllocation)
      .set({ updatedAt: new Date(Date.now() - DAY_MS) })
      .where(eq(mcpAccessKeyAllocation.id, reservation.id));
    return reservation.id;
  }

  function allocationsOf(actor: McpActor) {
    return target.database
      .select()
      .from(mcpAccessKeyAllocation)
      .where(eq(mcpAccessKeyAllocation.userId, actor.userId));
  }
});
