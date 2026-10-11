import { Inject, Injectable } from '@nestjs/common';

import {
  decodeGraphNodeId,
  encodeGraphNodeId,
} from '@/knowledge-graph/domain/graph-identity';
import {
  type GraphNodeKind,
  GraphOwnerKindSchema,
} from '@/knowledge-graph/domain/graph-read-contract';
import { KnowledgeGraphExploreService } from '@/knowledge-graph/knowledge-graph-explore.service';
import { KnowledgeGraphNodeListService } from '@/knowledge-graph/knowledge-graph-node-list.service';
import { KnowledgeGraphSearchService } from '@/knowledge-graph/knowledge-graph-search.service';
import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import {
  KNOWLEDGE_RECORD_KINDS,
  type KnowledgeRecord,
  rankKnowledgeRecords,
  toKnowledgeContextView,
  toQueryTerms,
  toRelationLines,
} from '@/mcp/tools/knowledge-graph/knowledge-graph-agent-view';
import {
  knowledgeGetContextTool,
  knowledgeSearchTool,
} from '@/mcp/tools/knowledge-graph/knowledge-graph-tool-definitions';
import { McpKnowledgeScopeResolver } from '@/mcp/tools/knowledge-graph/mcp-knowledge-scope.resolver';
import { toMcpOrganizationActor } from '@/mcp/tools/mcp-application-actor';

const DOCUMENT_RELATION_LIMIT = 20;
const CONTEXT_RELATION_LIMIT = 60;
const RECORD_LIMIT = 8;
const RECORD_MATCHES_PER_TERM = 10;
const CONTEXT_NODE_LIMIT = 50;

@Injectable()
export class KnowledgeGraphMcpRegistrar {
  constructor(
    @Inject(KnowledgeGraphSearchService)
    private readonly searchService: Pick<KnowledgeGraphSearchService, 'search'>,
    @Inject(KnowledgeGraphExploreService)
    private readonly exploreService: Pick<
      KnowledgeGraphExploreService,
      'explore'
    >,
    private readonly scopeResolver: McpKnowledgeScopeResolver,
    @Inject(KnowledgeGraphNodeListService)
    private readonly nodeListService: Pick<
      KnowledgeGraphNodeListService,
      'list'
    >,
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(knowledgeSearchTool, async (input, auth) => {
        const { organizationId, ...query } = input;
        const allowedNodeKinds = await this.scopeResolver.allowedNodeKinds(
          auth,
          organizationId,
        );
        const response = await this.searchService.search(
          toMcpOrganizationActor(auth),
          organizationId,
          query,
          allowedNodeKinds,
          { longExcerpt: true },
        );
        const terms = toQueryTerms(query.q);
        const [relations, records] = await Promise.all([
          Promise.all(
            response.items.map((item) =>
              this.documentRelations(
                auth,
                organizationId,
                item.source.nodeId,
                allowedNodeKinds,
                terms,
              ),
            ),
          ),
          this.matchingRecords(auth, organizationId, query.q, allowedNodeKinds),
        ]);
        return {
          ...response,
          items: response.items.map((item, index) => ({
            ...item,
            relations: relations[index] ?? [],
          })),
          records,
        };
      }),
      bindMcpTool(knowledgeGetContextTool, async (input, auth) => {
        const { organizationId, focusKind, focusId, depth } = input;
        const allowedNodeKinds = await this.scopeResolver.allowedNodeKinds(
          auth,
          organizationId,
        );
        const snapshot = await this.exploreService.explore(
          toMcpOrganizationActor(auth),
          organizationId,
          {
            focusKind,
            focusId: toFocusNodeId(focusKind, focusId),
            depth,
            limit: CONTEXT_NODE_LIMIT,
          },
          allowedNodeKinds,
        );
        return {
          ...toKnowledgeContextView(snapshot, CONTEXT_RELATION_LIMIT),
          completeness: snapshot.completeness,
          degradedReasons: snapshot.degradedReasons,
        };
      }),
    ];
  }

  private async documentRelations(
    auth: McpAuthContext,
    organizationId: string,
    nodeId: string,
    allowedNodeKinds: readonly GraphNodeKind[],
    terms: readonly string[],
  ): Promise<string[]> {
    const snapshot = await this.exploreService.explore(
      toMcpOrganizationActor(auth),
      organizationId,
      {
        focusKind: 'wiki_document',
        focusId: nodeId,
        depth: 1,
        limit: CONTEXT_NODE_LIMIT,
      },
      allowedNodeKinds,
    );
    return toRelationLines(snapshot, DOCUMENT_RELATION_LIMIT, terms).lines;
  }

  /** 검색은 위키 문서만 돌려주므로, 제목이 맞는 업무 원본을 따로 찾아 이어 갈 도구를 알 수 있게 한다. */
  private async matchingRecords(
    auth: McpAuthContext,
    organizationId: string,
    query: string,
    allowedNodeKinds: readonly GraphNodeKind[],
  ): Promise<KnowledgeRecord[]> {
    const kinds = KNOWLEDGE_RECORD_KINDS.filter((kind) =>
      allowedNodeKinds.includes(kind),
    );
    const terms = toQueryTerms(query);
    if (kinds.length === 0 || terms.length === 0) return [];

    const matches = await Promise.all(
      terms.map(async (term) => {
        const list = await this.nodeListService.list(
          toMcpOrganizationActor(auth),
          organizationId,
          { q: term, limit: RECORD_MATCHES_PER_TERM },
          kinds,
        );
        return list.items;
      }),
    );
    return rankKnowledgeRecords(matches, RECORD_LIMIT);
  }
}

/**
 * focusId로 graph node ID와 원본 ID를 모두 받는다.
 * 모델은 다른 도구가 돌려준 원본 ID를 그대로 넣는 일이 많다.
 */
function toFocusNodeId(focusKind: GraphNodeKind, focusId: string): string {
  try {
    decodeGraphNodeId(focusId);
    return focusId;
  } catch {
    const ownerKind = GraphOwnerKindSchema.safeParse(focusKind);
    if (!ownerKind.success) return focusId;
    try {
      return encodeGraphNodeId([1, 's', ownerKind.data, focusId]);
    } catch {
      return focusId;
    }
  }
}
