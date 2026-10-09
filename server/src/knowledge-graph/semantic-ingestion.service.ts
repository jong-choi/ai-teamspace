import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  type GraphDocument,
  ToolCallingGraphExtractionError,
} from '@repo/knowledge-graph';
import { assertSemanticEmbeddingBatch } from '@/knowledge-graph/domain/semantic-embedding';
import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';
import { semanticEmbeddingText } from '@/knowledge-graph/domain/semantic-generation';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { semanticRetryLimits } from '@/knowledge-graph/domain/semantic-retry-policy';
import {
  computeSemanticGaps,
  isSemanticTerminal,
} from '@/knowledge-graph/domain/semantic-source-gap';
import { computeSemanticSourceSignature } from '@/knowledge-graph/domain/semantic-source-signature';
import { semanticEligibleAt } from '@/knowledge-graph/domain/semantic-timing';
import { SemanticChunkerProvider } from '@/knowledge-graph/infrastructure/chunking/semantic-chunker.provider';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';
import { SemanticGraphStore } from '@/knowledge-graph/infrastructure/graph/semantic-graph-store.provider';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import type {
  SemanticLease,
  SemanticSourceCurrent,
  SemanticSourceScope,
} from '@/outbox/domain/semantic-source';

const SEMANTIC_GC_GRACE_MS = 10 * 60_000;

@Injectable()
export class SemanticIngestionService {
  private readonly logger = new Logger(SemanticIngestionService.name);
  constructor(
    private readonly state: SemanticSourceStateRepository,
    private readonly sources: WorkosSourceProvider,
    private readonly queue: SemanticJobQueueProvider,
    private readonly chunker: SemanticChunkerProvider,
    private readonly extractor: SemanticGraphExtractor,
    private readonly embedder: SemanticEmbedder,
    private readonly graph: SemanticGraphStore,
    private readonly corrections: SemanticCorrectionService,
  ) {}

  async run(
    scope: SemanticSourceScope,
    lastAttempt: boolean,
    signal: AbortSignal,
  ): Promise<'done' | 'busy'> {
    if (signal.aborted) throw new SemanticLeaseLostError();
    let current = await this.state.current(scope);
    if (!current) return 'done';
    if (current.version.deleted) return this.remove(scope, current);
    let gaps = computeSemanticGaps(current, semanticPipelineFingerprint);
    if (gaps.none) {
      await this.collectGarbage(scope, current);
      return 'done';
    }
    if (isSemanticTerminal(current, semanticPipelineFingerprint)) return 'done';
    if (!gaps.manual) {
      if (
        !current.state ||
        current.state.observedSeq < current.version.desiredSeq
      ) {
        await this.state.observeCommitted(scope, current.version.desiredSeq);
        current = await this.state.current(scope);
        if (!current || current.version.deleted) return 'done';
        gaps = computeSemanticGaps(current, semanticPipelineFingerprint);
      }
      const owner = await this.sources.wikiSemantic(
        scope.organizationId,
        scope.aggregateId,
      );
      if (!owner) return 'done';
      const due = semanticEligibleAt(current, owner.updatedAt);
      if (!gaps.manual && (!due || due > current.dbNow)) {
        await this.queue.auto(
          scope,
          due ? due.getTime() - current.dbNow.getTime() : 300_000,
        );
        return 'done';
      }
    }
    const lease = await this.state.acquireLease(
      scope,
      semanticPipelineFingerprint,
    );
    if (lease === 'busy') return 'busy';
    if (lease === 'missing') return 'done';
    let generationId: string | null = null;
    let activeCommitted = false;
    let activationAttempted = false;
    try {
      const before = await this.state.current(scope);
      const snapshot = await this.sources.wikiSemantic(
        scope.organizationId,
        scope.aggregateId,
      );
      const after = await this.state.current(scope);
      if (
        !snapshot ||
        snapshot.organizationId !== scope.organizationId ||
        snapshot.id !== scope.aggregateId ||
        !before ||
        !after ||
        before.version.desiredSeq !== lease.attemptSeq ||
        after.version.desiredSeq !== lease.attemptSeq ||
        after.version.deleted
      ) {
        await this.state.release(scope, lease, {
          runStatus: 'idle',
          lastErrorCode: null,
        });
        await this.followUp(scope);
        return 'done';
      }
      const signature = computeSemanticSourceSignature(snapshot);
      const nowGaps = computeSemanticGaps(after, semanticPipelineFingerprint);
      if (!nowGaps.manual) {
        const latestDue = semanticEligibleAt(after, snapshot.updatedAt);
        if (!latestDue || latestDue > after.dbNow) {
          await this.state.release(scope, lease, {
            runStatus: 'idle',
            lastErrorCode: null,
          });
          if (!latestDue)
            await this.state.observeCommitted(scope, after.version.desiredSeq);
          await this.followUp(scope);
          return 'done';
        }
      }
      const result = {
        indexedSignature: signature,
        indexedSourceUpdatedAt: snapshot.updatedAt,
        indexedFingerprint: semanticPipelineFingerprint,
      };
      if (
        !nowGaps.manual &&
        !nowGaps.fingerprint &&
        after.state?.indexedSeq &&
        after.state.indexedSignature === signature
      ) {
        await this.state.satisfyWithoutReindex(scope, lease, result);
        await this.followUp(scope);
        return 'done';
      }
      const chunks = await this.chunker.chunks(snapshot);
      generationId = randomUUID();
      if (chunks.length) {
        const graphs = await this.extractChunks(scope, lease, chunks, signal);
        await this.checkLease(scope, lease, signal);
        const vectors = await this.embedder.embedDocuments(
          chunks.map((chunk) => semanticEmbeddingText(snapshot.title, chunk)),
          signal,
        );
        assertSemanticEmbeddingBatch(vectors, chunks.length);
        await this.checkLease(scope, lease, signal);
        const stagingState = await this.state.current(scope);
        if (!stagingState) throw new SemanticLeaseLostError();
        await this.graph.stageGeneration({
          scope,
          generationId,
          signature,
          fingerprint: semanticPipelineFingerprint,
          sourceUpdatedAt: snapshot.updatedAt,
          createdAt: stagingState.dbNow,
          chunks,
          vectors,
          graphs,
        });
      }
      await this.checkLease(scope, lease, signal);
      activationAttempted = true;
      const activated = await this.state.activate(scope, lease, {
        ...result,
        activeGenerationId: generationId,
      });
      activeCommitted = activated.outcome === 'activated';
      if (activeCommitted)
        await this.reportCorrectionMatches(scope, generationId);
      if (activated.outcome === 'superseded')
        await this.discard(scope, generationId);
      // 이전 세대는 grace 뒤 별도 lease를 잡은 GC에서만 정리한다.
      await this.followUp(scope);
      return 'done';
    } catch (error) {
      if (activeCommitted) {
        this.logger.warn({ code: 'SEMANTIC_FOLLOW_UP_DELIVERY_FAILED' });
        return 'done';
      }
      if (activationAttempted && generationId) {
        try {
          const persisted = await this.state.current(scope);
          if (persisted?.state?.activeGenerationId === generationId) {
            try {
              await this.followUp(scope);
            } catch {
              this.logger.warn({ code: 'SEMANTIC_FOLLOW_UP_DELIVERY_FAILED' });
            }
            return 'done';
          }
        } catch {
          this.logger.warn({ code: 'SEMANTIC_ACTIVATION_VERIFY_FAILED' });
        }
      }
      if (error instanceof SemanticLeaseLostError || signal.aborted) {
        if (generationId && !activationAttempted)
          await this.discard(scope, generationId);
        return 'done';
      }
      const classified =
        error instanceof SemanticProviderError
          ? error
          : error instanceof ToolCallingGraphExtractionError
            ? new SemanticProviderError('EXTRACTION_INVALID_RESPONSE')
            : new SemanticProviderError(
                'SEMANTIC_INTERNAL',
                null,
                false,
                activationAttempted,
              );
      const sameAttempt =
        current.state?.attemptSeq === lease.attemptSeq &&
        current.state.attemptManualSeq === lease.attemptManualSeq &&
        current.state.attemptFingerprint === lease.attemptFingerprint;
      const terminal =
        !classified.retryable ||
        (sameAttempt &&
          (lastAttempt ||
            (current.state?.retryCount ?? 0) + 1 >=
              (classified.code === 'PROVIDER_RATE_LIMITED'
                ? semanticRetryLimits.rateLimitedAttempts
                : semanticRetryLimits.attempts)));
      const validation =
        classified.code === 'EXTRACTION_INVALID_RESPONSE' ||
        classified.code === 'EMBEDDING_INVALID';
      await this.state.release(scope, lease, {
        runStatus: terminal
          ? validation
            ? 'validation_failed'
            : 'failed'
          : 'retry_waiting',
        lastErrorCode: classified.code,
      });
      if (generationId && !activationAttempted)
        await this.discard(scope, generationId);
      throw terminal
        ? new SemanticProviderError(
            classified.code,
            classified.retryAfterMs,
            true,
          )
        : classified;
    }
  }

  private async extractChunks(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    chunks: readonly string[],
    signal: AbortSignal,
  ) {
    const graphs: GraphDocument[] = [];
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    for (let index = 0; index < chunks.length; index += 2) {
      await this.checkLease(scope, lease, combined);
      const results = await Promise.allSettled(
        chunks.slice(index, index + 2).map(async (text, offset) => {
          try {
            if (combined.aborted) throw new SemanticLeaseLostError();
            const result = await this.extractor.extract(
              text,
              index + offset,
              combined,
            );
            await this.checkLease(scope, lease, combined);
            return result;
          } catch (error) {
            controller.abort();
            throw error;
          }
        }),
      );
      const failure = results.find(
        (result) =>
          result.status === 'rejected' &&
          !(result.reason instanceof SemanticLeaseLostError),
      );
      if (failure?.status === 'rejected') throw failure.reason;
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        graphs.push(result.value);
      }
    }
    return graphs;
  }

  private async checkLease(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    signal: AbortSignal,
  ) {
    if (signal.aborted || !(await this.state.heartbeat(scope, lease)))
      throw new SemanticLeaseLostError();
  }
  private async followUp(scope: SemanticSourceScope) {
    const current = await this.state.current(scope);
    if (!current) return;
    if (current.version.deleted) {
      await this.queue.remove(scope, current.version.desiredSeq);
      return;
    }
    const gaps = computeSemanticGaps(current, semanticPipelineFingerprint);
    if (isSemanticTerminal(current, semanticPipelineFingerprint)) return;
    if (gaps.manual && current.state?.manualRequestId) {
      await this.queue.manual(scope, current.state.manualRequestId);
      return;
    }
    if (gaps.desired || gaps.fingerprint) {
      const snapshot = await this.sources.wikiSemantic(
        scope.organizationId,
        scope.aggregateId,
      );
      if (!snapshot) return;
      const due = semanticEligibleAt(current, snapshot.updatedAt);
      await this.queue.auto(
        scope,
        due ? Math.max(0, due.getTime() - current.dbNow.getTime()) : 300_000,
      );
    }
  }
  private async discard(scope: SemanticSourceScope, generationId: string) {
    try {
      await this.graph.deleteGeneration(scope, generationId);
    } catch {
      this.logger.warn({ code: 'SEMANTIC_ORPHAN_GC_FAILED' });
    }
  }
  private async reportCorrectionMatches(
    scope: SemanticSourceScope,
    generationId: string,
  ) {
    try {
      await this.corrections.reportMatches(scope, generationId);
    } catch {
      this.logger.warn({ code: 'SEMANTIC_CORRECTION_MATCH_REPORT_FAILED' });
    }
  }
  private async remove(
    scope: SemanticSourceScope,
    current: SemanticSourceCurrent,
  ): Promise<'done' | 'busy'> {
    if (
      current.state?.indexedSeq === current.version.desiredSeq &&
      !current.state.gcRequired
    )
      return 'done';
    const lease = await this.state.acquireLease(
      scope,
      semanticPipelineFingerprint,
    );
    if (lease === 'busy') return 'busy';
    if (lease === 'missing') return 'done';
    const removed = await this.state.markRemoved(scope, lease);
    if (removed.outcome === 'activated')
      await this.collectGarbage(scope, await this.state.current(scope));
    return 'done';
  }
  private async collectGarbage(
    scope: SemanticSourceScope,
    current: SemanticSourceCurrent | null,
  ) {
    if (!current?.state?.gcRequired) return;
    if (
      current.state.leaseToken &&
      current.state.leaseExpiresAt &&
      current.state.leaseExpiresAt > current.dbNow
    )
      return;
    const lastIndexed = current.state.lastIndexedAt;
    if (
      !current.version.deleted &&
      (!lastIndexed ||
        lastIndexed.getTime() + SEMANTIC_GC_GRACE_MS > current.dbNow.getTime())
    )
      return;
    const lease = await this.state.acquireLease(
      scope,
      semanticPipelineFingerprint,
    );
    if (typeof lease === 'string') return;
    try {
      const checked = await this.state.current(scope);
      if (
        !checked ||
        (!checked.version.deleted &&
          !computeSemanticGaps(checked, semanticPipelineFingerprint).none)
      )
        return;
      const keep = checked.version.deleted
        ? null
        : (checked.state?.activeGenerationId ?? null);
      const finished = await this.graph.deleteInactiveGenerations(
        scope,
        keep,
        new Date(checked.dbNow.getTime() - SEMANTIC_GC_GRACE_MS),
      );
      await this.state.release(scope, lease, {
        runStatus: 'idle',
        lastErrorCode: null,
      });
      if (finished) await this.state.clearGc(scope, keep);
    } catch {
      this.logger.warn({ code: 'SEMANTIC_GENERATION_GC_FAILED' });
    } finally {
      await this.state.release(scope, lease, {
        runStatus: 'idle',
        lastErrorCode: null,
      });
    }
  }
}
