import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { ApplicationError } from '@/application.error';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { completeGraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { encodeGraphNodeId } from '@/knowledge-graph/domain/graph-identity';
import { KnowledgeGraphAuthorizationUnavailableError } from '@/knowledge-graph/domain/graph-query.error';
import { assertKnowledgeGraphQueryEnabled } from '@/knowledge-graph/domain/graph-read.error';
import { KnowledgeGraphSemanticSearchUnavailableError } from '@/knowledge-graph/domain/graph-search.error';
import {
  buildPlainTextExcerpt,
  foldSemanticHitsBySource,
  fuseSearchCandidates,
  type KeywordSearchCandidate,
  type SemanticSearchCandidate,
} from '@/knowledge-graph/domain/graph-search-fusion';
import { planSemanticSearch } from '@/knowledge-graph/domain/graph-search-plan';
import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { computeSemanticSourceSignature } from '@/knowledge-graph/domain/semantic-source-signature';
import type {
  SearchAllowedNodeKind,
  SearchDegradedReason,
  SearchQuery,
  SearchResponse,
} from '@/knowledge-graph/dto/graph-search.dto';
import { SearchResponseSchema } from '@/knowledge-graph/dto/graph-search.dto';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { KnowledgeGraphSemanticSearchReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-semantic-search-reader.provider';
import { SearchQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/search-quota.repository';
import { SemanticSearchStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-search-state.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { WikiSemanticGraphSource } from '@/wiki/domain/wiki-graph-source';

@Injectable()
export class KnowledgeGraphSearchService {
  private readonly logger = new Logger(KnowledgeGraphSearchService.name);

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly access: GraphSourceAccessProvider,
    private readonly snapshots: GraphSourceSnapshotProvider,
    private readonly searchQuota: SearchQuotaRepository,
    private readonly completeness: GraphCompletenessService,
    private readonly embedder: SemanticEmbedder,
    private readonly searchState: SemanticSearchStateRepository,
    private readonly reader: KnowledgeGraphSemanticSearchReader,
  ) {}

  async search(
    actor: OrganizationActorContext,
    organizationId: string,
    query: SearchQuery,
    allowedNodeKinds?: readonly SearchAllowedNodeKind[],
  ): Promise<SearchResponse> {
    const startedAt = Date.now();
    assertKnowledgeGraphQueryEnabled(this.config);
    await this.pg(() => this.access.assertReadable(actor, organizationId));
    if (allowedNodeKinds && !allowedNodeKinds.includes('wiki_document'))
      return this.empty(query, []);

    if (query.mode !== 'keyword')
      await this.pg(() =>
        this.searchQuota.consume({
          organizationId,
          actorUserId: actor.userId,
        }),
      );
    const completeness = await this.pg(() =>
      this.completeness.forOrganization(organizationId),
    );

    const degradedReasons = new Set<SearchDegradedReason>();
    let semanticRecall: SearchResponse['semanticRecall'] = null;
    let semanticCandidates: SemanticSearchCandidate[] = [];
    let keywordCandidates: KeywordSearchCandidate[] = [];

    if (query.mode !== 'keyword') {
      if (!this.config.semanticEnabled)
        degradedReasons.add('semantic_disabled');
      else {
        try {
          const vector = await this.embedQuery(query.q);
          const searchable = await this.pg(() =>
            this.searchState.listSearchableSources(
              organizationId,
              semanticPipelineFingerprint,
              this.config.searchEnnMaxSources + 1,
            ),
          );
          const plan = planSemanticSearch({
            searchableSourceCount: searchable.length,
            ennMaxSources: this.config.searchEnnMaxSources,
            candidateLimit: query.limit * 8,
          });
          if (plan.kind === 'exact') {
            const hits = await this.reader.semanticExact({
              organizationId,
              fingerprint: semanticPipelineFingerprint,
              scopes: searchable
                .filter((source) => source.activeGenerationId)
                .map((source) => ({
                  sourceId: source.aggregateId,
                  generationId: String(source.activeGenerationId),
                })),
              vector,
              candidateLimit: plan.candidateLimit,
            });
            const searchableById = new Map(
              searchable.map((source) => [source.aggregateId, source]),
            );
            semanticCandidates = foldSemanticHitsBySource(
              hits.flatMap((hit) => {
                const source = searchableById.get(hit.sourceId);
                if (
                  !source?.indexedSourceUpdatedAt ||
                  source.activeGenerationId !== hit.generationId
                )
                  return [];
                return [
                  {
                    ...hit,
                    indexedSourceUpdatedAt: source.indexedSourceUpdatedAt,
                  },
                ];
              }),
            );
          } else {
            semanticCandidates = await this.approximateSemanticHits({
              organizationId,
              vector,
              limit: query.limit,
              steps: plan.overfetchSteps,
            });
          }
          semanticRecall = plan.kind === 'exact' ? 'exact' : 'approximate';
        } catch (error) {
          if (
            error instanceof KnowledgeGraphSemanticSearchUnavailableError ||
            error instanceof SemanticProviderError ||
            error instanceof SemanticLeaseLostError
          ) {
            degradedReasons.add('graph_unavailable');
          } else {
            throw error;
          }
        }
      }
    }

    if (query.mode !== 'semantic') {
      keywordCandidates = (
        await this.pg(() =>
          this.snapshots.wikiKeyword(organizationId, query.q, 50),
        )
      ).map((candidate) => ({
        sourceId: candidate.id,
        matchedIn: candidate.matchedIn,
      }));
    }

    const fused = fuseSearchCandidates({
      semantic: semanticCandidates,
      keyword: keywordCandidates,
      limit: query.limit * 4,
    });
    const verification = await this.verifyCandidates({
      organizationId,
      query,
      candidates: fused,
    });
    await this.pg(() => this.access.assertReadable(actor, organizationId));

    const response = SearchResponseSchema.parse({
      mode: query.mode,
      completeness,
      semanticRecall,
      degradedReasons: [...degradedReasons],
      items: verification.items.slice(0, query.limit).map((item, index) => ({
        ...item,
        fusedRank: index + 1,
      })),
    });
    this.logger.log({
      code: 'KG_SEARCH_COMPLETED',
      mode: query.mode,
      recall: semanticRecall,
      candidateCount: fused.length,
      droppedStale: verification.droppedStale,
      droppedMissing: verification.droppedMissing,
      latencyMs: Date.now() - startedAt,
    });
    return response;
  }

  private async approximateSemanticHits(input: {
    organizationId: string;
    vector: readonly number[];
    limit: number;
    steps: readonly number[];
  }): Promise<SemanticSearchCandidate[]> {
    let accepted: SemanticSearchCandidate[] = [];
    for (const k of input.steps) {
      const batch = await this.reader.semanticApproximate({
        organizationId: input.organizationId,
        fingerprint: semanticPipelineFingerprint,
        vector: input.vector,
        k,
      });
      const ids = [...new Set(batch.map((hit) => hit.sourceId))];
      const states = await this.pg(() =>
        this.searchState.currentBatch(
          input.organizationId,
          'wiki_document',
          ids,
        ),
      );
      const stateById = new Map(
        states.map((state) => [state.aggregateId, state]),
      );
      accepted = foldSemanticHitsBySource(
        batch.flatMap((hit) => {
          const state = stateById.get(hit.sourceId);
          if (
            !state ||
            state.deleted ||
            state.activeGenerationId !== hit.generationId ||
            state.indexedFingerprint !== semanticPipelineFingerprint ||
            !state.indexedSourceUpdatedAt
          )
            return [];
          return [
            {
              ...hit,
              indexedSourceUpdatedAt: state.indexedSourceUpdatedAt,
            },
          ];
        }),
      );
      if (accepted.length >= input.limit || batch.length < k) break;
    }
    return accepted;
  }

  private async verifyCandidates(input: {
    organizationId: string;
    query: SearchQuery;
    candidates: ReturnType<typeof fuseSearchCandidates>;
  }) {
    const ids = [
      ...new Set(input.candidates.map((candidate) => candidate.sourceId)),
    ];
    const [states, owners] = await Promise.all([
      this.pg(() =>
        this.searchState.currentBatch(
          input.organizationId,
          'wiki_document',
          ids,
        ),
      ),
      this.pg(() => this.snapshots.wikiSemantic(input.organizationId, ids)),
    ]);
    const stateById = new Map(
      states.map((state) => [state.aggregateId, state]),
    );
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
    const items: Array<Omit<SearchResponse['items'][number], 'fusedRank'>> = [];
    let droppedMissing = 0;
    let droppedStale = 0;

    for (const candidate of input.candidates) {
      const owner = ownerById.get(candidate.sourceId);
      if (!owner) {
        droppedMissing++;
        continue;
      }
      const semantic = this.verifySemantic({
        candidate: candidate.semantic,
        owner,
        state: stateById.get(candidate.sourceId),
      });
      if (candidate.semantic && !semantic) droppedStale++;
      const keyword = candidate.keyword
        ? { matchedIn: [...candidate.keyword.matchedIn] }
        : null;
      const matchedBy: SearchResponse['items'][number]['matchedBy'] = [];
      if (semantic) matchedBy.push('semantic');
      if (keyword) matchedBy.push('keyword');
      if (matchedBy.length === 0) continue;
      items.push({
        source: {
          kind: 'wiki_document',
          id: owner.id,
          nodeId: encodeGraphNodeId([1, 's', 'wiki_document', owner.id]),
          title: owner.title,
          updatedAt: owner.updatedAt.toISOString(),
        },
        matchedBy,
        semantic: semantic
          ? {
              score: semantic.score,
              chunkIndex: semantic.chunkIndex,
              generationId: semantic.generationId,
              indexedSourceUpdatedAt:
                semantic.indexedSourceUpdatedAt.toISOString(),
            }
          : null,
        keyword,
        excerpt: buildPlainTextExcerpt({
          text: semantic?.text ?? owner.contentMarkdown,
          query: input.query.q,
        }),
      });
    }
    return { items, droppedMissing, droppedStale };
  }

  private verifySemantic(input: {
    candidate: SemanticSearchCandidate | null;
    owner: WikiSemanticGraphSource;
    state:
      | Awaited<
          ReturnType<SemanticSearchStateRepository['currentBatch']>
        >[number]
      | undefined;
  }) {
    if (!input.candidate || !input.state || input.state.deleted) return null;
    if (input.state.activeGenerationId !== input.candidate.generationId)
      return null;
    if (input.state.indexedFingerprint !== semanticPipelineFingerprint)
      return null;
    if (
      input.state.indexedSignature !==
      computeSemanticSourceSignature(input.owner)
    )
      return null;
    return input.candidate;
  }

  private async embedQuery(query: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      return await this.embedder.embedQuery(query, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async pg<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new KnowledgeGraphAuthorizationUnavailableError({ cause: error });
    }
  }

  private empty(
    query: SearchQuery,
    degradedReasons: SearchDegradedReason[],
  ): SearchResponse {
    return SearchResponseSchema.parse({
      mode: query.mode,
      completeness: completeGraphCompleteness(),
      semanticRecall: null,
      degradedReasons,
      items: [],
    });
  }
}
