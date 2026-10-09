import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { SemanticCorrectionCreate } from '@/knowledge-graph/domain/semantic-correction';
import {
  SemanticCorrectionCreateSchema,
  SemanticCorrectionMatchReportSchema,
  SemanticCorrectionSchema,
  SemanticCorrectionSourceSchema,
} from '@/knowledge-graph/domain/semantic-correction';
import {
  semanticCorrection,
  semanticCorrectionSource,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.schema';
import { SemanticCorrectionInsertSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.zod';
import { SemanticCorrectionRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-correction.repository';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

import { and, asc, eq, inArray } from 'drizzle-orm';

type Transaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class SemanticCorrectionDrizzleRepository extends SemanticCorrectionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  create(input: SemanticCorrectionCreate) {
    return this.database.db.transaction(async (transaction) => {
      const parsed = SemanticCorrectionCreateSchema.parse(input);
      const revision = await this.nextRevision(transaction, parsed);
      const [row] = await transaction
        .insert(semanticCorrection)
        .values(
          SemanticCorrectionInsertSchema.parse({
            ...parsed,
            createdRevision: revision,
          }),
        )
        .returning();
      if (!row) throw new Error('의미 보정 저장 결과가 없습니다.');
      return {
        editRevision: revision,
        corrections: [SemanticCorrectionSchema.parse(row)],
      };
    });
  }

  createLinkedPair(
    firstInput: SemanticCorrectionCreate,
    secondInput: SemanticCorrectionCreate,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const first = SemanticCorrectionCreateSchema.parse(firstInput);
      const second = SemanticCorrectionCreateSchema.parse(secondInput);
      if (
        first.organizationId !== second.organizationId ||
        first.sourceKind !== second.sourceKind ||
        first.sourceId !== second.sourceId
      )
        throw new Error('짝 보정의 원본 범위가 다릅니다.');
      const revision = await this.nextRevision(transaction, first);
      const firstId = randomUUID();
      const secondId = randomUUID();
      const rows = await transaction
        .insert(semanticCorrection)
        .values([
          SemanticCorrectionInsertSchema.parse({
            ...first,
            id: firstId,
            linkedCorrectionId: secondId,
            createdRevision: revision,
          }),
          SemanticCorrectionInsertSchema.parse({
            ...second,
            id: secondId,
            linkedCorrectionId: firstId,
            createdRevision: revision,
          }),
        ])
        .returning();
      if (rows.length !== 2)
        throw new Error('짝 의미 보정 저장 결과가 완전하지 않습니다.');
      return {
        editRevision: revision,
        corrections: rows.map((row) => SemanticCorrectionSchema.parse(row)),
      };
    });
  }

  cancel(
    scope: SemanticSourceScope,
    correctionId: string,
    actorUserId: string,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const [source] = await transaction
        .select()
        .from(semanticCorrectionSource)
        .where(this.sourceWhere(scope))
        .for('update');
      if (!source) return null;
      const [current] = await transaction
        .select()
        .from(semanticCorrection)
        .where(
          and(
            this.correctionScopeWhere(scope),
            eq(semanticCorrection.id, correctionId),
          ),
        )
        .for('update');
      if (!current) return null;
      if (current.status === 'cancelled')
        return {
          editRevision: source.editRevision,
          corrections: [SemanticCorrectionSchema.parse(current)],
        };
      const revision = source.editRevision + 1;
      const now = new Date();
      const ids = current.linkedCorrectionId
        ? [current.id, current.linkedCorrectionId]
        : [current.id];
      const rows = await transaction
        .update(semanticCorrection)
        .set({
          status: 'cancelled',
          cancelledRevision: revision,
          cancelledByUserId: actorUserId,
          cancelledAt: now,
        })
        .where(
          and(
            this.correctionScopeWhere(scope),
            inArray(semanticCorrection.id, ids),
            eq(semanticCorrection.status, 'active'),
          ),
        )
        .returning();
      await this.setRevision(transaction, scope, source.editRevision, revision);
      return {
        editRevision: revision,
        corrections: rows.map((row) => SemanticCorrectionSchema.parse(row)),
      };
    });
  }

  async listActive(scope: SemanticSourceScope) {
    const [source] = await this.database.db
      .select()
      .from(semanticCorrectionSource)
      .where(this.sourceWhere(scope));
    if (!source) return { editRevision: 0, corrections: [] };
    const rows = await this.database.db
      .select()
      .from(semanticCorrection)
      .where(
        and(
          this.correctionScopeWhere(scope),
          eq(semanticCorrection.status, 'active'),
        ),
      )
      .orderBy(
        asc(semanticCorrection.createdRevision),
        asc(semanticCorrection.id),
      );
    return {
      editRevision: SemanticCorrectionSourceSchema.parse(source).editRevision,
      corrections: rows.map((row) => SemanticCorrectionSchema.parse(row)),
    };
  }

  async reportMatches(
    scope: SemanticSourceScope,
    generationId: string,
    reportInput: readonly unknown[],
  ) {
    const reports = reportInput.map((report) =>
      SemanticCorrectionMatchReportSchema.parse(report),
    );
    const now = new Date();
    await this.database.db.transaction(async (transaction) => {
      for (const report of reports)
        await transaction
          .update(semanticCorrection)
          .set({
            lastMatchState: report.state,
            lastMatchedGenerationId: generationId,
            lastMatchedAt: now,
          })
          .where(
            and(
              this.correctionScopeWhere(scope),
              eq(semanticCorrection.id, report.correctionId),
              eq(semanticCorrection.status, 'active'),
            ),
          );
    });
  }

  private async nextRevision(
    transaction: Transaction,
    scope: Pick<
      SemanticCorrectionCreate,
      'organizationId' | 'sourceKind' | 'sourceId'
    >,
  ) {
    await transaction
      .insert(semanticCorrectionSource)
      .values({
        organizationId: scope.organizationId,
        sourceKind: scope.sourceKind,
        sourceId: scope.sourceId,
      })
      .onConflictDoNothing();
    const [source] = await transaction
      .select()
      .from(semanticCorrectionSource)
      .where(
        this.sourceWhere({
          organizationId: scope.organizationId,
          aggregateKind: scope.sourceKind,
          aggregateId: scope.sourceId,
        }),
      )
      .for('update');
    if (!source) throw new Error('의미 보정 revision 원본이 없습니다.');
    const revision = source.editRevision + 1;
    await this.setRevision(
      transaction,
      {
        organizationId: scope.organizationId,
        aggregateKind: scope.sourceKind,
        aggregateId: scope.sourceId,
      },
      source.editRevision,
      revision,
    );
    return revision;
  }

  private async setRevision(
    transaction: Transaction,
    scope: SemanticSourceScope,
    expectedRevision: number,
    revision: number,
  ) {
    const [updated] = await transaction
      .update(semanticCorrectionSource)
      .set({ editRevision: revision, updatedAt: new Date() })
      .where(
        and(
          this.sourceWhere(scope),
          eq(semanticCorrectionSource.editRevision, expectedRevision),
        ),
      )
      .returning({ editRevision: semanticCorrectionSource.editRevision });
    if (!updated) throw new Error('의미 보정 revision 경합을 감지했습니다.');
  }

  private sourceWhere(scope: SemanticSourceScope) {
    return and(
      eq(semanticCorrectionSource.organizationId, scope.organizationId),
      eq(semanticCorrectionSource.sourceKind, scope.aggregateKind),
      eq(semanticCorrectionSource.sourceId, scope.aggregateId),
    );
  }

  private correctionScopeWhere(scope: SemanticSourceScope) {
    return and(
      eq(semanticCorrection.organizationId, scope.organizationId),
      eq(semanticCorrection.sourceKind, scope.aggregateKind),
      eq(semanticCorrection.sourceId, scope.aggregateId),
    );
  }
}
