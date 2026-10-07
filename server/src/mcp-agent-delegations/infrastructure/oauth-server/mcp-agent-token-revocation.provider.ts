export abstract class McpAgentTokenRevocationProvider {
  abstract revokeRefreshToken(refreshToken: string): Promise<void>;
}
