import { Injectable } from '@nestjs/common';

import {
  KnowledgeGraphCorrectionNotActiveError,
  KnowledgeGraphCorrectionNotFoundError,
  KnowledgeGraphCorrectionTargetAmbiguousError,
} from '@/knowledge-graph/domain/graph-command.error';
import {
  decodeGraphEdgeId,
  decodeGraphNodeId,
} from '@/knowledge-graph/domain/graph-identity';
import {
  KnowledgeGraphEdgeNotFoundError,
  KnowledgeGraphNodeNotFoundError,
  KnowledgeGraphViewChangedError,
} from '@/knowledge-graph/domain/graph-read.error';
import type {
  CreateSemanticCorrectionCommandInput,
  QuerySemanticCorrectionsInput,
  UpdateSemanticCorrectionCommandInput,
} from '@/knowledge-graph/dto/semantic-correction-command.dto';
import { GraphCorrectionWriteRepository } from '@/knowledge-graph/infrastructure/persistence/graph-correction-write.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

@Injectable()
export class GraphCorrectionCommandService {
  constructor(
    private readonly corrections: SemanticCorrectionService,
    private readonly access: GraphSourceAccessProvider,
    private readonly correctionWrites: GraphCorrectionWriteRepository,
  ) {}

  async create(
    actor: OrganizationActorContext,
    organizationId: string,
    actorUserId: string,
    input: CreateSemanticCorrectionCommandInput,
  ) {
    await this.access.assertReadable(actor, organizationId);
    if (input.action === 'label_override') {
      if (!input.nodeId || !input.value || !('label' in input.value))
        throw new KnowledgeGraphNodeNotFoundError();
      const label = input.value.label;
      const target = this.decodeSemanticNode(organizationId, input.nodeId);
      const locked = await this.correctionWrites.runLockedWiki(
        organizationId,
        actorUserId,
        target.sourceId,
        async () =>
          this.mapCreated(
            await this.corrections.createLabelOverrideInCurrentTransaction(
              target.scope,
              target.generationId,
              target.targetKey,
              label,
              actorUserId,
            ),
            'label_override',
          ),
      );
      if (locked.outcome === 'not_found')
        throw new KnowledgeGraphNodeNotFoundError();
      return locked.value;
    }

    if (input.action === 'correct_predicate') {
      if (!input.edgeId || !input.value || !('predicate' in input.value))
        throw new KnowledgeGraphEdgeNotFoundError();
      const predicate = input.value.predicate;
      const target = this.decodeSemanticEdge(organizationId, input.edgeId);
      const locked = await this.correctionWrites.runLockedWiki(
        organizationId,
        actorUserId,
        target.sourceId,
        async () =>
          this.mapCreated(
            await this.corrections.correctPredicateInCurrentTransaction(
              target.scope,
              target.generationId,
              target.targetKey,
              predicate,
              actorUserId,
            ),
            'correct_predicate',
          ),
      );
      if (locked.outcome === 'not_found')
        throw new KnowledgeGraphEdgeNotFoundError();
      return locked.value;
    }

    if (input.nodeId) {
      const target = this.decodeSemanticNode(organizationId, input.nodeId);
      const locked = await this.correctionWrites.runLockedWiki(
        organizationId,
        actorUserId,
        target.sourceId,
        async () =>
          this.mapCreated(
            await this.corrections.createSuppressInCurrentTransaction(
              target.scope,
              target.generationId,
              'entity',
              target.targetKey,
              actorUserId,
            ),
            'suppress',
          ),
      );
      if (locked.outcome === 'not_found')
        throw new KnowledgeGraphNodeNotFoundError();
      return locked.value;
    }

    if (!input.edgeId) throw new KnowledgeGraphEdgeNotFoundError();
    const target = this.decodeSemanticEdge(organizationId, input.edgeId);
    const locked = await this.correctionWrites.runLockedWiki(
      organizationId,
      actorUserId,
      target.sourceId,
      async () =>
        this.mapCreated(
          await this.corrections.createSuppressInCurrentTransaction(
            target.scope,
            target.generationId,
            'relation',
            target.targetKey,
            actorUserId,
          ),
          'suppress',
        ),
    );
    if (locked.outcome === 'not_found')
      throw new KnowledgeGraphEdgeNotFoundError();
    return locked.value;
  }

  async list(
    actor: OrganizationActorContext,
    organizationId: string,
    query: QuerySemanticCorrectionsInput,
  ) {
    await this.access.assertReadable(actor, organizationId);
    let scope: SemanticSourceScope;
    if (query.nodeId) {
      const target = this.decodeSemanticNode(organizationId, query.nodeId);
      if (
        !(await this.corrections.isActiveGeneration(
          target.scope,
          target.generationId,
        ))
      )
        throw new KnowledgeGraphViewChangedError();
      scope = target.scope;
    } else {
      scope = this.wikiScope(organizationId, query.sourceId ?? '');
    }
    const current = await this.corrections.listActive(scope);
    return {
      editRevision: current.editRevision,
      items: current.corrections.map((correction) => ({
        id: correction.id,
        linkedCorrectionId: correction.linkedCorrectionId,
        targetKind: correction.targetKind,
        action: correction.action,
        anchor: correction.anchor,
        value: correction.value,
        createdRevision: correction.createdRevision,
        lastMatchState: correction.lastMatchState,
        lastMatchedGenerationId: correction.lastMatchedGenerationId,
        createdAt: correction.createdAt.toISOString(),
      })),
    };
  }

  async update(
    organizationId: string,
    correctionId: string,
    actorUserId: string,
    input: UpdateSemanticCorrectionCommandInput,
  ) {
    const current = await this.corrections.findById(
      organizationId,
      correctionId,
    );
    if (!current) throw new KnowledgeGraphCorrectionNotFoundError();
    const locked = await this.correctionWrites.runLockedWiki(
      organizationId,
      actorUserId,
      current.sourceId,
      async () => {
        const result =
          await this.corrections.replaceLabelOverrideByIdInCurrentTransaction(
            organizationId,
            correctionId,
            input.value.label,
            actorUserId,
          );
        if (result.outcome !== 'replaced') {
          if (result.outcome === 'not_found')
            throw new KnowledgeGraphCorrectionNotFoundError();
          throw new KnowledgeGraphCorrectionNotActiveError();
        }
        const replacement = result.corrections[0];
        if (!replacement) throw new KnowledgeGraphCorrectionNotActiveError();
        return {
          correctionId: replacement.id,
          linkedCorrectionId: replacement.linkedCorrectionId,
          action: 'label_override' as const,
          editRevision: result.editRevision,
          matchState: 'matched' as const,
        };
      },
    );
    if (locked.outcome === 'not_found')
      throw new KnowledgeGraphCorrectionNotFoundError();
    return locked.value;
  }

  async delete(
    organizationId: string,
    correctionId: string,
    actorUserId: string,
  ) {
    const current = await this.corrections.findById(
      organizationId,
      correctionId,
    );
    if (!current) throw new KnowledgeGraphCorrectionNotFoundError();
    const locked = await this.correctionWrites.runLockedWiki(
      organizationId,
      actorUserId,
      current.sourceId,
      async () => {
        const result = await this.corrections.cancelByIdInCurrentTransaction(
          organizationId,
          correctionId,
          actorUserId,
        );
        if (result.outcome === 'not_found')
          throw new KnowledgeGraphCorrectionNotFoundError();
        if (result.outcome === 'not_active')
          throw new KnowledgeGraphCorrectionNotActiveError();
      },
    );
    if (locked.outcome === 'not_found')
      throw new KnowledgeGraphCorrectionNotFoundError();
  }

  private decodeSemanticNode(organizationId: string, nodeId: string) {
    let decoded: ReturnType<typeof decodeGraphNodeId>;
    try {
      decoded = decodeGraphNodeId(nodeId);
    } catch {
      throw new KnowledgeGraphNodeNotFoundError();
    }
    if (decoded[1] !== 'e') throw new KnowledgeGraphNodeNotFoundError();
    const [, , kind, sourceId, generationId, targetKey] = decoded;
    if (kind !== 'wiki_document') throw new KnowledgeGraphNodeNotFoundError();
    return {
      scope: this.wikiScope(organizationId, sourceId),
      sourceId,
      generationId,
      targetKey,
    };
  }

  private decodeSemanticEdge(organizationId: string, edgeId: string) {
    let decoded: ReturnType<typeof decodeGraphEdgeId>;
    try {
      decoded = decodeGraphEdgeId(edgeId);
    } catch {
      throw new KnowledgeGraphEdgeNotFoundError();
    }
    if (decoded[1] !== 'sr') throw new KnowledgeGraphEdgeNotFoundError();
    const [, , sourceId, generationId, targetKey] = decoded;
    return {
      scope: this.wikiScope(organizationId, sourceId),
      sourceId,
      generationId,
      targetKey,
    };
  }

  private wikiScope(
    organizationId: string,
    sourceId: string,
  ): SemanticSourceScope {
    return {
      organizationId,
      aggregateKind: 'wiki_document',
      aggregateId: sourceId,
    };
  }

  private mapCreated(
    result: Awaited<
      ReturnType<
        SemanticCorrectionService['createSuppressInCurrentTransaction']
      >
    >,
    action: 'label_override' | 'suppress' | 'correct_predicate',
  ) {
    if (result.outcome === 'view_changed')
      throw new KnowledgeGraphViewChangedError();
    if (result.outcome === 'ambiguous_review')
      throw new KnowledgeGraphCorrectionTargetAmbiguousError();
    const first = result.corrections[0];
    if (!first) throw new KnowledgeGraphCorrectionTargetAmbiguousError();
    return {
      correctionId: first.id,
      linkedCorrectionId: first.linkedCorrectionId,
      action,
      editRevision: result.editRevision,
      matchState: 'matched' as const,
    };
  }
}
