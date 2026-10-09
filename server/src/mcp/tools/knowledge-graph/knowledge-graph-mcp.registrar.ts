import { Inject, Injectable } from '@nestjs/common';

import { KnowledgeGraphExploreService } from '@/knowledge-graph/knowledge-graph-explore.service';
import { KnowledgeGraphSearchService } from '@/knowledge-graph/knowledge-graph-search.service';
import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import {
  knowledgeGetContextTool,
  knowledgeSearchTool,
} from '@/mcp/tools/knowledge-graph/knowledge-graph-tool-definitions';
import { McpKnowledgeScopeResolver } from '@/mcp/tools/knowledge-graph/mcp-knowledge-scope.resolver';
import { toMcpOrganizationActor } from '@/mcp/tools/mcp-application-actor';

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
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(knowledgeSearchTool, async (input, auth) => {
        const { organizationId, ...query } = input;
        const allowedNodeKinds = await this.scopeResolver.allowedNodeKinds(
          auth,
          organizationId,
        );
        return this.searchService.search(
          toMcpOrganizationActor(auth),
          organizationId,
          query,
          allowedNodeKinds,
        );
      }),
      bindMcpTool(knowledgeGetContextTool, async (input, auth) => {
        const { organizationId, ...query } = input;
        const allowedNodeKinds = await this.scopeResolver.allowedNodeKinds(
          auth,
          organizationId,
        );
        return this.exploreService.explore(
          toMcpOrganizationActor(auth),
          organizationId,
          { ...query, limit: 50 },
          allowedNodeKinds,
        );
      }),
    ];
  }
}
