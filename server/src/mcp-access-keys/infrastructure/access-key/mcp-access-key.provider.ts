import type {
  CreateMcpAccessKeyProviderInput,
  McpAccessKeyRecord,
  McpAccessKeySecretRecord,
  UpdateMcpAccessKeyProviderInput,
} from '@/mcp-access-keys/domain/mcp-access-key';

export abstract class McpAccessKeyProvider {
  abstract createForUser(
    input: CreateMcpAccessKeyProviderInput,
  ): Promise<McpAccessKeySecretRecord>;

  abstract listForUser(userId: string): Promise<McpAccessKeyRecord[]>;

  abstract getForUser(
    userId: string,
    keyId: string,
  ): Promise<McpAccessKeyRecord | null>;

  abstract updateForUser(
    input: UpdateMcpAccessKeyProviderInput,
  ): Promise<McpAccessKeyRecord>;

  abstract revoke(userId: string, keyId: string): Promise<boolean>;
}
