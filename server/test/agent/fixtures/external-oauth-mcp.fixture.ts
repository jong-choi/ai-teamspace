import { createHash, randomUUID } from 'node:crypto';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { json, urlencoded } from 'express';
import { z } from 'zod';

const registrationSchema = z.object({
  redirect_uris: z.array(z.url()).min(1),
  token_endpoint_auth_method: z.literal('none'),
  grant_types: z.array(z.string()),
  response_types: z.array(z.string()),
  client_name: z.string().optional(),
  software_id: z.string().optional(),
  scope: z.string().optional(),
});

const tokenRequestSchema = z
  .object({
    grant_type: z.enum(['authorization_code', 'refresh_token']),
    client_id: z.string(),
    code: z.string().optional(),
    code_verifier: z.string().optional(),
    redirect_uri: z.url().optional(),
    refresh_token: z.string().optional(),
    resource: z.url().optional(),
  })
  .passthrough();

export interface ExternalOauthMcpFixtureState {
  registrationRequests: number;
  tokenRequests: number;
  refreshRequests: number;
  revocationRequests: number;
  toolCalls: Array<{ clientId: string; query: string }>;
}

export interface StartedExternalOauthMcpFixture {
  url: string;
  issuer: string;
  state: ExternalOauthMcpFixtureState;
  authorize(authorizationUrl: URL): Promise<URL>;
  invalidateAccessToken(accessToken: string): void;
  revokeRefreshToken(refreshToken: string): void;
  close(): Promise<void>;
}

/**
 * DCR, authorization code+PKCE, refresh rotation을 실제 HTTPS로 제공하는 외부 MCP fixture다.
 * Work OS production module을 우회하지 않고 MCP SDK client의 표준 OAuth wire contract를 검증한다.
 */
export async function startExternalOauthMcpFixture(options: {
  tls: { key: string; cert: string };
}): Promise<StartedExternalOauthMcpFixture> {
  const state: ExternalOauthMcpFixtureState = {
    registrationRequests: 0,
    tokenRequests: 0,
    refreshRequests: 0,
    revocationRequests: 0,
    toolCalls: [],
  };
  const clients = new Map<string, z.infer<typeof registrationSchema>>();
  const authorizationCodes = new Map<
    string,
    {
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      resource: string;
      used: boolean;
    }
  >();
  const accessTokens = new Map<
    string,
    { clientId: string; resource: string; active: boolean }
  >();
  const refreshTokens = new Map<
    string,
    { clientId: string; resource: string; active: boolean }
  >();
  let origin = '';

  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const token = bearerToken(
        requestInfo?.headers.get('authorization') ?? undefined,
      );
      const access = token ? accessTokens.get(token) : undefined;
      if (!access?.active) throw new Error('OAuth access token이 필요합니다.');
      return createFixtureServer(access.clientId, state);
    },
    { legacy: 'reject' },
  );
  const app = createMcpExpressApp();
  app.use(json());
  app.use(urlencoded({ extended: false }));

  app.get(
    [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ],
    (_request, response) => {
      response.json({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        bearer_methods_supported: ['header'],
        scopes_supported: ['fixture.read'],
      });
    },
  );
  app.get('/.well-known/oauth-authorization-server', (_request, response) => {
    response.json({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      revocation_endpoint: `${origin}/revoke`,
      scopes_supported: ['fixture.read'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    });
  });
  app.post('/register', (request, response) => {
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid_client_metadata' });
      return;
    }
    const clientId = `client-${randomUUID()}`;
    clients.set(clientId, parsed.data);
    state.registrationRequests += 1;
    response.status(201).json({
      ...parsed.data,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1_000),
    });
  });
  app.get('/authorize', (request, response) => {
    const authorizationUrl = new URL(request.originalUrl, origin);
    const clientId = authorizationUrl.searchParams.get('client_id');
    const redirectUri = authorizationUrl.searchParams.get('redirect_uri');
    const stateParam = authorizationUrl.searchParams.get('state');
    const codeChallenge = authorizationUrl.searchParams.get('code_challenge');
    const resource = authorizationUrl.searchParams.get('resource');
    const client = clientId ? clients.get(clientId) : undefined;
    if (
      !clientId ||
      !client ||
      !redirectUri ||
      !client.redirect_uris.includes(redirectUri) ||
      !stateParam ||
      !codeChallenge ||
      !resource ||
      resource !== `${origin}/mcp`
    ) {
      response.status(400).json({ error: 'invalid_request' });
      return;
    }
    const code = `code-${randomUUID()}`;
    authorizationCodes.set(code, {
      clientId,
      redirectUri,
      codeChallenge,
      resource,
      used: false,
    });
    const callback = new URL(redirectUri);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', stateParam);
    callback.searchParams.set('iss', origin);
    response.redirect(302, callback.toString());
  });
  app.post('/token', (request, response) => {
    const parsed = tokenRequestSchema.safeParse(request.body);
    if (!parsed.success || !clients.has(parsed.data.client_id)) {
      response.status(400).json({ error: 'invalid_request' });
      return;
    }
    state.tokenRequests += 1;
    if (parsed.data.grant_type === 'authorization_code') {
      const code = parsed.data.code
        ? authorizationCodes.get(parsed.data.code)
        : undefined;
      if (
        !code ||
        code.used ||
        code.clientId !== parsed.data.client_id ||
        code.redirectUri !== parsed.data.redirect_uri ||
        code.resource !== parsed.data.resource ||
        !parsed.data.code_verifier ||
        code.codeChallenge !== pkceChallenge(parsed.data.code_verifier)
      ) {
        response.status(400).json({ error: 'invalid_grant' });
        return;
      }
      code.used = true;
      response.json(
        issueTokens(code.clientId, code.resource, accessTokens, refreshTokens),
      );
      return;
    }

    state.refreshRequests += 1;
    const refresh = parsed.data.refresh_token
      ? refreshTokens.get(parsed.data.refresh_token)
      : undefined;
    if (
      !refresh?.active ||
      refresh.clientId !== parsed.data.client_id ||
      refresh.resource !== parsed.data.resource
    ) {
      response.status(400).json({ error: 'invalid_grant' });
      return;
    }
    refresh.active = false;
    response.json(
      issueTokens(
        refresh.clientId,
        refresh.resource,
        accessTokens,
        refreshTokens,
      ),
    );
  });
  app.post('/revoke', (request, response) => {
    const token = z.object({ token: z.string() }).safeParse(request.body);
    if (token.success) {
      const access = accessTokens.get(token.data.token);
      const refresh = refreshTokens.get(token.data.token);
      if (access) access.active = false;
      if (refresh) refresh.active = false;
    }
    state.revocationRequests += 1;
    response.status(200).end();
  });
  app.use('/mcp', (request, response, next) => {
    const token = bearerToken(request.header('authorization'));
    const access = token ? accessTokens.get(token) : undefined;
    if (!access?.active || access.resource !== `${origin}/mcp`) {
      response
        .status(401)
        .set(
          'WWW-Authenticate',
          `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
        )
        .json({ error: 'invalid_token' });
      return;
    }
    next();
  });
  const nodeHandler = toNodeHandler(handler);
  app.all('/mcp', (request, response) =>
    nodeHandler(request, response, request.body),
  );

  const httpServer = createHttpsServer(options.tls, app).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  const address = httpServer.address() as AddressInfo;
  origin = `https://127.0.0.1:${address.port}`;

  return {
    url: `${origin}/mcp`,
    issuer: origin,
    state,
    authorize: async (authorizationUrl) => {
      const response = await fetch(authorizationUrl, { redirect: 'manual' });
      if (response.status !== 302) {
        throw new Error(
          `OAuth authorize 응답이 302가 아니라 ${response.status}입니다.`,
        );
      }
      const location = response.headers.get('location');
      if (!location)
        throw new Error('OAuth authorize 응답에 location이 없습니다.');
      return new URL(location);
    },
    invalidateAccessToken: (accessToken) => {
      const token = accessTokens.get(accessToken);
      if (!token) throw new Error('폐기할 access token을 찾지 못했습니다.');
      token.active = false;
    },
    revokeRefreshToken: (refreshToken) => {
      const token = refreshTokens.get(refreshToken);
      if (!token) throw new Error('폐기할 refresh token을 찾지 못했습니다.');
      token.active = false;
    },
    close: async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function issueTokens(
  clientId: string,
  resource: string,
  accessTokens: Map<
    string,
    { clientId: string; resource: string; active: boolean }
  >,
  refreshTokens: Map<
    string,
    { clientId: string; resource: string; active: boolean }
  >,
) {
  const accessToken = `access-${randomUUID()}`;
  const refreshToken = `refresh-${randomUUID()}`;
  accessTokens.set(accessToken, { clientId, resource, active: true });
  refreshTokens.set(refreshToken, { clientId, resource, active: true });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 3_600,
    scope: 'fixture.read',
  };
}

function createFixtureServer(
  clientId: string,
  state: ExternalOauthMcpFixtureState,
): McpServer {
  const server = new McpServer({
    name: 'external-oauth-mcp-fixture',
    version: '1.0.0',
  });
  server.registerTool(
    'oauth_fixture_read',
    {
      description: 'OAuth fixture 데이터를 읽습니다.',
      inputSchema: z.object({ query: z.string() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query }) => {
      state.toolCalls.push({ clientId, query });
      return { content: [{ type: 'text', text: `read:${query}` }] };
    },
  );
  return server;
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length);
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
