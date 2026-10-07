import type { AgentMcpConnectionsConfig } from '@/agent-mcp-connections/config/agent-mcp-connections-config.type';
import { withBoundedResponseBody } from '@/agent-mcp-connections/infrastructure/http/bounded-response';
import { SafeOutboundHttp } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http';

import { assertUrlIsSafeToFetch, guardedFetch } from 'guarded-fetch';

export class GuardedSafeOutboundHttpAdapter extends SafeOutboundHttp {
  constructor(private readonly config: AgentMcpConnectionsConfig) {
    super();
  }

  async assertSafe(input: string | URL): Promise<URL> {
    const url = this.toUrl(input);
    const result = await assertUrlIsSafeToFetch(url, this.securityOptions(url));
    return result.url;
  }

  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = this.toUrl(input);
    const requestInit = { ...init };
    const signal = requestInit.signal ?? undefined;
    delete requestInit.redirect;
    delete requestInit.signal;

    const response = await guardedFetch(url, {
      ...requestInit,
      signal,
      ...this.securityOptions(url),
      timeoutMs: this.config.toolTimeoutMs,
      followRedirects: false,
      maxRedirects: 0,
      sanitizeHeaders: true,
    });
    return withBoundedResponseBody(response, this.config.maxResponseBytes);
  }

  private securityOptions(url: URL) {
    if (!this.config.allowPrivateNetworks) {
      return {
        httpsOnly: true,
        opaqueErrors: true,
      } as const;
    }

    return {
      httpsOnly: true,
      opaqueErrors: true,
      allowedHosts: [url.hostname],
      skipSsrfCheckForAllowedHosts: true,
    } as const;
  }

  private toUrl(input: string | URL): URL {
    return input instanceof URL ? new URL(input) : new URL(input);
  }
}
