import { Injectable } from '@nestjs/common';

import type { GraphNodeKind } from '@/knowledge-graph/domain/graph-read-contract';
import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { MCP_SCOPES, type McpScope } from '@/mcp/contracts/mcp-scope';
import { McpAccessService } from '@/mcp-access/mcp-access.service';

export type KnowledgeGraphAllowedNodeKind = GraphNodeKind;

const WIKI_GATE_KINDS = [
  'wiki_document',
  'semantic_entity',
  'curated_node',
] as const satisfies readonly KnowledgeGraphAllowedNodeKind[];

const OPTIONAL_SCOPE_KINDS = [
  {
    scope: 'projects:read',
    kinds: ['project', 'ticket'],
  },
  {
    scope: 'calendar:read',
    kinds: ['meeting'],
  },
  {
    scope: 'organizations:read',
    kinds: ['member'],
  },
] as const satisfies readonly {
  scope: McpScope;
  kinds: readonly KnowledgeGraphAllowedNodeKind[];
}[];

@Injectable()
export class McpKnowledgeScopeResolver {
  constructor(private readonly mcpAccessService: McpAccessService) {}

  async allowedNodeKinds(
    auth: McpAuthContext,
    organizationId: string,
  ): Promise<KnowledgeGraphAllowedNodeKind[]> {
    const allowed = new Set<KnowledgeGraphAllowedNodeKind>(WIKI_GATE_KINDS);

    for (const candidate of OPTIONAL_SCOPE_KINDS) {
      if (!auth.scopes.includes(candidate.scope)) continue;

      const decision = await this.mcpAccessService.evaluate({
        auth,
        organizationId,
        requiredScope: candidate.scope,
        deploymentScopes: MCP_SCOPES,
      });
      if (!decision.allowed) continue;

      for (const kind of candidate.kinds) {
        allowed.add(kind);
      }
    }

    return [...allowed];
  }
}
