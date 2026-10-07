import { Injectable } from '@nestjs/common';

import {
  type McpOAuthConnectionListDto,
  McpOAuthConnectionListSchema,
} from '@/mcp-oauth-connections/dto/mcp-oauth-connection.dto';
import { McpOAuthConnectionProvider } from '@/mcp-oauth-connections/infrastructure/oauth-connection/mcp-oauth-connection.provider';

@Injectable()
export class McpOAuthConnectionsService {
  constructor(private readonly provider: McpOAuthConnectionProvider) {}

  async list(userId: string): Promise<McpOAuthConnectionListDto> {
    const items = await this.provider.listForUser(userId);
    return McpOAuthConnectionListSchema.parse({ items });
  }

  async revoke(userId: string, consentId: string): Promise<void> {
    await this.provider.revokeForUser(userId, consentId);
  }
}
