import { Injectable } from '@nestjs/common';

import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import { McpToolAccessDeniedError } from '@/mcp/tools/mcp-tool.error';
import type { McpToolDefinition } from '@/mcp/tools/mcp-tool-definition';
import { McpAccessService } from '@/mcp-access/mcp-access.service';

import { z } from 'zod';

const organizationIdSchema = z.string().trim().min(1);

@Injectable()
export class McpToolAuthorizationService {
  constructor(private readonly mcpAccessService: McpAccessService) {}

  async authorize(
    definition: McpToolDefinition,
    input: Record<string, unknown>,
    auth: McpAuthContext,
  ): Promise<void> {
    if (!MCP_SCOPES.includes(definition.requiredScope)) {
      throw new McpToolAccessDeniedError('deployment_ceiling');
    }

    if (!auth.scopes.includes(definition.requiredScope)) {
      throw new McpToolAccessDeniedError('credential_scope');
    }

    if (definition.name === 'organizations_list') {
      return;
    }

    const organizationId = organizationIdSchema.parse(input.organizationId);
    const decision = await this.mcpAccessService.evaluate({
      auth,
      organizationId,
      requiredScope: definition.requiredScope,
      deploymentScopes: MCP_SCOPES,
    });

    if (!decision.allowed) {
      throw new McpToolAccessDeniedError(decision.reason);
    }
  }
}
