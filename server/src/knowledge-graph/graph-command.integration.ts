import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { semanticCorrectionTargetId } from '@/knowledge-graph/domain/semantic-correction';
import {
  semanticCorrection,
  semanticCorrectionSource,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.schema';
import { SemanticCorrectionPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/semantic-correction-persistence.module';
import { SemanticCorrectionRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-correction.repository';

import { and, eq } from 'drizzle-orm';

const describeGraphCommandIntegration =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a4'
    ? describe
    : describe.skip;

describeGraphCommandIntegration('R8-07 보정 PostgreSQL 원자 편집', () => {
  const organizationId = `p8a4-${randomUUID()}`;
  const actorUserId = `p8a4-actor-${randomUUID()}`;
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const sourceAnchor = {
    v: 1 as const,
    entityType: 'Person' as const,
    normalizedName: '지윤',
    evidenceDigest: 'a'.repeat(64),
    occurrence: 1,
    extractorFingerprint: 'b'.repeat(64),
  };
  const targetAnchor = {
    v: 1 as const,
    entityType: 'Technology' as const,
    normalizedName: 'neo4j',
    evidenceDigest: 'c'.repeat(64),
    occurrence: 1,
    extractorFingerprint: 'd'.repeat(64),
  };
  const relationAnchor = {
    v: 1 as const,
    source: sourceAnchor,
    target: targetAnchor,
    predicate: 'USES' as const,
  };

  let moduleRef: TestingModule;
  let database: DatabaseService;
  let repository: SemanticCorrectionRepository;
  let seeded = false;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [databaseConfig],
        }),
        SemanticCorrectionPersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService);
    repository = moduleRef.get(SemanticCorrectionRepository);

    await database.db.insert(user).values({
      id: actorUserId,
      name: 'P8 A4 보정 사용자',
      email: `${actorUserId}@example.test`,
    });
    seeded = true;
  });

  beforeEach(async () => {
    await database.db
      .delete(semanticCorrection)
      .where(eq(semanticCorrection.organizationId, organizationId));
    await database.db
      .delete(semanticCorrectionSource)
      .where(eq(semanticCorrectionSource.organizationId, organizationId));
  });

  afterAll(async () => {
    if (seeded) {
      await database.db
        .delete(semanticCorrection)
        .where(eq(semanticCorrection.organizationId, organizationId));
      await database.db
        .delete(semanticCorrectionSource)
        .where(eq(semanticCorrectionSource.organizationId, organizationId));
      await database.db.delete(user).where(eq(user.id, actorUserId));
    }
    await moduleRef?.close();
  });

  it('label replacement는 취소+신규를 한 revision 증가로 저장하고 새 correctionId를 만든다', async () => {
    const created = await database.runInTransaction(() =>
      repository.createInCurrentTransaction({
        organizationId,
        sourceKind: 'wiki_document',
        sourceId,
        correctionTargetId: semanticCorrectionTargetId('entity', sourceAnchor),
        targetKind: 'entity',
        action: 'label_override',
        anchor: sourceAnchor,
        value: { label: '지윤' },
        createdByUserId: actorUserId,
      }),
    );
    expect(created.editRevision).toBe(1);
    const oldId = created.corrections[0]!.id;

    const replaced = await database.runInTransaction(() =>
      repository.replaceLabelOverrideByIdInCurrentTransaction(
        organizationId,
        oldId,
        '지윤님',
        actorUserId,
      ),
    );

    expect(replaced.outcome).toBe('replaced');
    if (replaced.outcome !== 'replaced')
      throw new Error('교체 결과가 없습니다.');
    expect(replaced.editRevision).toBe(2);
    expect(replaced.corrections[0]).toMatchObject({
      status: 'active',
      action: 'label_override',
      createdRevision: 2,
      value: { label: '지윤님' },
    });
    expect(replaced.corrections[0]!.id).not.toBe(oldId);

    const rows = await database.db
      .select()
      .from(semanticCorrection)
      .where(
        and(
          eq(semanticCorrection.organizationId, organizationId),
          eq(semanticCorrection.sourceId, sourceId),
        ),
      );
    expect(rows).toHaveLength(2);
    expect(rows.find(({ id }) => id === oldId)).toMatchObject({
      status: 'cancelled',
      cancelledRevision: 2,
    });
    const [source] = await database.db
      .select()
      .from(semanticCorrectionSource)
      .where(eq(semanticCorrectionSource.organizationId, organizationId));
    expect(source?.editRevision).toBe(2);

    const replay = await database.runInTransaction(() =>
      repository.replaceLabelOverrideByIdInCurrentTransaction(
        organizationId,
        oldId,
        '재시도',
        actorUserId,
      ),
    );
    expect(replay).toEqual({ outcome: 'not_active' });
    const [afterReplay] = await database.db
      .select()
      .from(semanticCorrectionSource)
      .where(eq(semanticCorrectionSource.organizationId, organizationId));
    expect(afterReplay?.editRevision).toBe(2);
  });

  it('predicate correction의 linked pair는 한 revision에 생기고 어느 쪽을 취소해도 둘 다 같은 revision에 취소된다', async () => {
    const created = await database.runInTransaction(() =>
      repository.createLinkedPairInCurrentTransaction(
        {
          organizationId,
          sourceKind: 'wiki_document',
          sourceId,
          correctionTargetId: semanticCorrectionTargetId(
            'relation',
            relationAnchor,
          ),
          targetKind: 'relation',
          action: 'suppress',
          anchor: relationAnchor,
          value: null,
          createdByUserId: actorUserId,
        },
        {
          organizationId,
          sourceKind: 'wiki_document',
          sourceId,
          correctionTargetId: semanticCorrectionTargetId('relation', {
            ...relationAnchor,
            predicate: 'RELATED_TO',
          }),
          targetKind: 'relation',
          action: 'asserted_relation',
          anchor: { ...relationAnchor, predicate: 'RELATED_TO' },
          value: {
            predicate: 'RELATED_TO',
            source: sourceAnchor,
            target: targetAnchor,
          },
          createdByUserId: actorUserId,
        },
      ),
    );

    expect(created.editRevision).toBe(1);
    expect(created.corrections).toHaveLength(2);
    const [first, second] = created.corrections;
    expect(first?.linkedCorrectionId).toBe(second?.id);
    expect(second?.linkedCorrectionId).toBe(first?.id);
    expect(first?.createdRevision).toBe(1);
    expect(second?.createdRevision).toBe(1);

    const cancelled = await database.runInTransaction(() =>
      repository.cancelByIdInCurrentTransaction(
        organizationId,
        first!.id,
        actorUserId,
      ),
    );
    expect(cancelled.outcome).toBe('cancelled');
    if (cancelled.outcome !== 'cancelled')
      throw new Error('짝 보정 취소 결과가 없습니다.');
    expect(cancelled.editRevision).toBe(2);
    expect(cancelled.corrections).toHaveLength(2);
    expect(
      cancelled.corrections.every(
        ({ status, cancelledRevision }) =>
          status === 'cancelled' && cancelledRevision === 2,
      ),
    ).toBe(true);

    const replay = await database.runInTransaction(() =>
      repository.cancelByIdInCurrentTransaction(
        organizationId,
        second!.id,
        actorUserId,
      ),
    );
    expect(replay).toEqual({ outcome: 'not_active' });
  });

  it('ALS transaction 안에서 보정을 쓴 뒤 예외가 나면 correction과 revision source가 모두 rollback된다', async () => {
    await expect(
      database.runInTransaction(async () => {
        await repository.createInCurrentTransaction({
          organizationId,
          sourceKind: 'wiki_document',
          sourceId,
          correctionTargetId: semanticCorrectionTargetId(
            'entity',
            sourceAnchor,
          ),
          targetKind: 'entity',
          action: 'suppress',
          anchor: sourceAnchor,
          value: null,
          createdByUserId: actorUserId,
        });
        throw new Error('generation changed');
      }),
    ).rejects.toThrow('generation changed');

    expect(
      await database.db
        .select()
        .from(semanticCorrection)
        .where(eq(semanticCorrection.organizationId, organizationId)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(semanticCorrectionSource)
        .where(eq(semanticCorrectionSource.organizationId, organizationId)),
    ).toHaveLength(0);
  });

  it('다른 조직 correctionId는 ID lookup과 쓰기 모두 not found로 닫힌다', async () => {
    const created = await database.runInTransaction(() =>
      repository.createInCurrentTransaction({
        organizationId,
        sourceKind: 'wiki_document',
        sourceId,
        correctionTargetId: semanticCorrectionTargetId('entity', sourceAnchor),
        targetKind: 'entity',
        action: 'suppress',
        anchor: sourceAnchor,
        value: null,
        createdByUserId: actorUserId,
      }),
    );
    const correctionId = created.corrections[0]!.id;

    await expect(
      repository.findById('other-organization', correctionId),
    ).resolves.toBeNull();
    await expect(
      database.runInTransaction(() =>
        repository.cancelByIdInCurrentTransaction(
          'other-organization',
          correctionId,
          actorUserId,
        ),
      ),
    ).resolves.toEqual({ outcome: 'not_found' });
  });
});
