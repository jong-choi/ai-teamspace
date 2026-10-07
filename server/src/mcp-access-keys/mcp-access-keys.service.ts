import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import { MCP_ACCESS_KEY_PREFIX } from '@/mcp-access-keys/domain/mcp-access-key-contract';
import type { McpConnectionInfo } from '@/mcp-access-keys/dto/mcp-connection-info.dto';
import { McpConnectionInfoSchema } from '@/mcp-access-keys/dto/mcp-connection-info.dto';

@Injectable()
export class McpAccessKeysService {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  getConnectionInfo(): McpConnectionInfo {
    const config = this.configService.getOrThrow('mcp', { infer: true });

    return McpConnectionInfoSchema.parse({
      resourceUrl: config.resourceUrl,
      protocolVersion: '2026-07-28',
      authMethods: ['oauth', 'personal-access-key'],
      accessKey: {
        prefix: MCP_ACCESS_KEY_PREFIX,
        maxActiveKeys: config.accessKey.maxActivePerUser,
        defaultExpiresInDays: config.accessKey.defaultExpiresInDays,
        maxExpiresInDays: config.accessKey.maxExpiresInDays,
      },
      scopes: MCP_SCOPES,
    });
  }
}
