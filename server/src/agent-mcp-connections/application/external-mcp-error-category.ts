import {
  AgentMcpOauthAuthorizationRequiredError,
  AgentMcpOauthCredentialInvalidError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentMcpLastErrorCategory } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';

import {
  InsufficientScopeError,
  OAuthError,
  SdkError,
  SdkErrorCode,
  UnauthorizedError,
  UnsupportedProtocolVersionError,
} from '@modelcontextprotocol/client';

export function classifyExternalMcpError(
  error: unknown,
): AgentMcpLastErrorCategory {
  if (error instanceof AgentMcpOauthAuthorizationRequiredError) {
    return 'authorization_required';
  }
  if (error instanceof AgentMcpOauthCredentialInvalidError) {
    return 'credential_expired';
  }
  if (error instanceof OAuthError && error.code === 'invalid_grant') {
    return 'credential_expired';
  }
  if (
    error instanceof UnauthorizedError ||
    error instanceof InsufficientScopeError
  ) {
    return 'authorization_required';
  }
  if (error instanceof UnsupportedProtocolVersionError) {
    return 'protocol_incompatible';
  }
  if (error instanceof SdkError) {
    if (
      error.code === SdkErrorCode.MethodNotSupportedByProtocolVersion ||
      error.code === SdkErrorCode.ClientHttpNotImplemented
    ) {
      return 'protocol_incompatible';
    }
    if (
      error.code === SdkErrorCode.ClientHttpAuthentication ||
      error.code === SdkErrorCode.ClientHttpForbidden
    ) {
      return 'authorization_required';
    }
    if (
      error.code === SdkErrorCode.RequestTimeout ||
      error.code === SdkErrorCode.NotConnected ||
      error.code === SdkErrorCode.ConnectionClosed ||
      error.code === SdkErrorCode.SendFailed ||
      error.code === SdkErrorCode.ClientHttpFailedToOpenStream
    ) {
      return 'connection_unavailable';
    }
  }
  if (
    (error instanceof DOMException && error.name === 'TimeoutError') ||
    error instanceof TypeError
  ) {
    return 'connection_unavailable';
  }
  return 'discovery_failed';
}
