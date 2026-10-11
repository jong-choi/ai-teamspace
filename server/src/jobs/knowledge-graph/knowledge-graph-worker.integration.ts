import { randomUUID } from 'node:crypto';

import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';

describe('API producer와 활성 Jobs relay의 실제 실행 분리', () => {
  const organizationId = `kg-worker-${randomUUID()}`;
  const actorId = `kg-worker-actor-${randomUUID()}`;
  const original = new Map<string, string | undefined>();
  const applyWiki = jest.fn().mockResolvedValue(undefined);
  let app: TestingModule;
  let database: DatabaseService['db'];

  beforeAll(async () => {
    const overrides = {
      KG_PROJECTION_ENABLED: 'true',
      NEO4J_URI: 'bolt://127.0.0.1:47687',
      NEO4J_USERNAME: 'neo4j',
      NEO4J_PASSWORD: 'integration-only',
      BULLMQ_PREFIX: `kg-worker-${randomUUID()}`,
    };
    for (const [key, value] of Object.entries(overrides)) {
      original.set(key, process.env[key]);
      process.env[key] = value;
    }
    app = await Test.createTestingModule({
      imports: [JobsModule, WikiDrizzlePersistenceModule],
    })
      .overrideProvider(KnowledgeGraphWriter)
      .useValue({ applyWiki })
      .compile();
    await app.init();
    database = app.get(DatabaseService).db;
    await database.insert(user).values({
      id: actorId,
      name: 'Jobs 검증 사용자',
      email: `${actorId}@example.com`,
      username: actorId,
    });
    await database.insert(organization).values({
      id: organizationId,
      name: 'Jobs 검증 조직',
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    try {
      if (database) {
        await database
          .delete(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.organizationId, organizationId));
        await database
          .delete(organization)
          .where(eq(organization.id, organizationId));
        await database.delete(user).where(eq(user.id, actorId));
      }
    } finally {
      try {
        await app?.close();
      } finally {
        for (const [key, value] of original) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  it('API relay는 꺼지고 Jobs relay만 자동 전달해 최신 source와 PG 확인까지 처리한다', async () => {
    const relays = app.get(OutboxRelay, { each: true });
    expect(relays.filter((relay) => relay.running)).toHaveLength(1);
    expect(relays.some((relay) => !relay.running)).toBe(true);
    const document = new Y.Doc();
    const created = await app.get(WikiRepository).createDocument(
      organizationId,
      actorId,
      {
        parentDocumentId: null,
        title: '활성 Jobs 전달',
        position: 0,
        contentMarkdown: '',
      },
      { encodedState: Y.encodeStateAsUpdate(document), contentMarkdown: '' },
      1,
    );
    await waitForCondition(
      async () => {
        const [state] = await database
          .select()
          .from(outboxAggregateVersion)
          .where(
            and(
              eq(outboxAggregateVersion.organizationId, organizationId),
              eq(outboxAggregateVersion.aggregateId, created.id),
            ),
          );
        return state?.appliedSeq === 1 && state.projectionStatus === 'applied';
      },
      'Jobs가 committed Wiki를 전달하고 확인하지 못했습니다.',
      { timeoutMs: 15_000 },
    );
    expect(applyWiki).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        aggregateId: created.id,
        desiredSeq: 1,
      }),
      expect.objectContaining({ id: created.id, title: '활성 Jobs 전달' }),
    );
    // 이 테스트는 Neo4j port만 stub으로 대체한다. 실제 graph fencing은 writer integration이 검증한다.
  });
});
