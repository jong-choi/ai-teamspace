import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import {
  CuratedGraphEndpointInvalidError,
  CuratedGraphNodeConnectedError,
  CuratedGraphRevisionConflictError,
} from '@/knowledge-graph/domain/curated-graph.error';
import { CuratedGraphRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph.repository';
import { CuratedGraphPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/curated-graph-persistence.module';
import { curatedEditAudit } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edit-audit.schema';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { eq, inArray } from 'drizzle-orm';

const organizationAId = 'kg-curated-integration-org-a';
const organizationBId = 'kg-curated-integration-org-b';
const actorUserId = 'kg-curated-integration-user';

describe('curated 그래프 PostgreSQL owner 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: CuratedGraphRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        CuratedGraphPersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(CuratedGraphRepository);
  });

  beforeEach(async () => {
    await database
      .delete(outboxAggregateVersion)
      .where(
        inArray(outboxAggregateVersion.organizationId, [
          organizationAId,
          organizationBId,
        ]),
      );
    await database
      .delete(organization)
      .where(inArray(organization.id, [organizationAId, organizationBId]));
    await database.delete(user).where(eq(user.id, actorUserId));

    await database.insert(user).values({
      id: actorUserId,
      name: 'curated 그래프 테스트 사용자',
      email: 'kg-curated-integration@example.com',
      username: 'kgcuratedintegration',
    });
    await database.insert(organization).values([
      {
        id: organizationAId,
        name: 'curated 그래프 조직 A',
        slug: organizationAId,
        createdAt: new Date('2026-10-08T00:00:00.000Z'),
      },
      {
        id: organizationBId,
        name: 'curated 그래프 조직 B',
        slug: organizationBId,
        createdAt: new Date('2026-10-08T00:00:00.000Z'),
      },
    ]);
  });

  afterAll(async () => {
    if (database) {
      await database
        .delete(outboxAggregateVersion)
        .where(
          inArray(outboxAggregateVersion.organizationId, [
            organizationAId,
            organizationBId,
          ]),
        );
      await database
        .delete(organization)
        .where(inArray(organization.id, [organizationAId, organizationBId]));
      await database.delete(user).where(eq(user.id, actorUserId));
    }
    await moduleRef?.close();
  });

  it('node create/update는 revision CAS와 감사·Outbox를 같은 원본 흐름에 남긴다', async () => {
    const node = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: '원본',
    });
    expect(node.revision).toBe(1);

    const updated = await repository.updateNode(
      organizationAId,
      node.id,
      actorUserId,
      1,
      { title: '수정됨' },
    );
    expect(updated).toMatchObject({ title: '수정됨', revision: 2 });

    await expect(
      repository.updateNode(organizationAId, node.id, actorUserId, 1, {
        title: 'stale',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphRevisionConflictError);

    const audits = await database
      .select()
      .from(curatedEditAudit)
      .where(eq(curatedEditAudit.targetId, node.id));
    expect(audits.map(({ operation }) => operation)).toEqual([
      'create',
      'update',
    ]);
    expect(audits.every(({ afterDigest }) => afterDigest !== null)).toBe(true);

    const [projection] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.aggregateId, node.id));
    expect(projection).toMatchObject({
      organizationId: organizationAId,
      aggregateKind: 'curated_node',
      desiredSeq: 2,
      deleted: false,
    });
  });

  it('edge는 같은 조직의 활성 curated node만 연결하고 연결된 node 삭제를 막는다', async () => {
    const source = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: 'source',
    });
    const target = await repository.createNode(organizationAId, actorUserId, {
      kind: 'custom',
      title: 'target',
    });
    const otherOrganizationNode = await repository.createNode(
      organizationBId,
      actorUserId,
      { kind: 'custom', title: 'other' },
    );

    await expect(
      repository.createEdge(organizationAId, actorUserId, {
        sourceNodeId: source.id,
        targetNodeId: otherOrganizationNode.id,
        predicate: 'related_to',
      }),
    ).rejects.toBeInstanceOf(CuratedGraphEndpointInvalidError);

    const edge = await repository.createEdge(organizationAId, actorUserId, {
      sourceNodeId: source.id,
      targetNodeId: target.id,
      predicate: 'related_to',
    });
    await expect(
      repository.deleteNode(
        organizationAId,
        source.id,
        actorUserId,
        source.revision,
      ),
    ).rejects.toBeInstanceOf(CuratedGraphNodeConnectedError);

    const removedEdge = await repository.deleteEdge(
      organizationAId,
      edge.id,
      actorUserId,
      edge.revision,
    );
    expect(removedEdge).toMatchObject({ status: 'deleted', revision: 2 });

    const removedNode = await repository.deleteNode(
      organizationAId,
      source.id,
      actorUserId,
      source.revision,
    );
    expect(removedNode).toMatchObject({ status: 'deleted', revision: 2 });
  });
});
