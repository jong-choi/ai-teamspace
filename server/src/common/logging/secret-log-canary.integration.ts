import { format } from 'node:util';

import { Logger } from '@nestjs/common';

import {
  type StartedWorkOsMcpFixture,
  startWorkOsMcpFixture,
} from '@test/agent/fixtures/workos-mcp.fixture';
import {
  type LoopbackTlsCertificate,
  trustLoopbackTlsCertificate,
} from '@test/support/loopback-tls';
import { McpIntegrationApp } from '@test/support/mcp-integration.fixture';

const PASSWORD = 'StrongPassword123!';
const SCOPES = ['wiki:read'] as const;

describe('structured log secret canary 검증', () => {
  let target: McpIntegrationApp;
  let tls: LoopbackTlsCertificate;
  let externalMcp: StartedWorkOsMcpFixture;
  let output = '';
  let stdoutWrite: jest.SpiedFunction<typeof process.stdout.write>;
  let stderrWrite: jest.SpiedFunction<typeof process.stderr.write>;
  let consoleLog: jest.SpiedFunction<typeof console.log>;
  let consoleError: jest.SpiedFunction<typeof console.error>;
  let consoleWarn: jest.SpiedFunction<typeof console.warn>;
  let consoleInfo: jest.SpiedFunction<typeof console.info>;
  let consoleDebug: jest.SpiedFunction<typeof console.debug>;
  let nestLog: jest.SpiedFunction<Logger['log']>;
  let nestError: jest.SpiedFunction<Logger['error']>;
  let nestWarn: jest.SpiedFunction<Logger['warn']>;
  let nestDebug: jest.SpiedFunction<Logger['debug']>;
  let nestVerbose: jest.SpiedFunction<Logger['verbose']>;
  let nestFatal: jest.SpiedFunction<Logger['fatal']>;

  beforeAll(async () => {
    stdoutWrite = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        output += String(chunk);
        return true;
      });
    stderrWrite = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        output += String(chunk);
        return true;
      });
    const captureConsole = (...values: unknown[]): void => {
      output += `${format(...values)}\n`;
    };
    consoleLog = jest.spyOn(console, 'log').mockImplementation(captureConsole);
    consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(captureConsole);
    consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(captureConsole);
    consoleInfo = jest
      .spyOn(console, 'info')
      .mockImplementation(captureConsole);
    consoleDebug = jest
      .spyOn(console, 'debug')
      .mockImplementation(captureConsole);
    nestLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(captureConsole);
    nestError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(captureConsole);
    nestWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(captureConsole);
    nestDebug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(captureConsole);
    nestVerbose = jest
      .spyOn(Logger.prototype, 'verbose')
      .mockImplementation(captureConsole);
    nestFatal = jest
      .spyOn(Logger.prototype, 'fatal')
      .mockImplementation(captureConsole);
    tls = await trustLoopbackTlsCertificate();
    externalMcp = await startWorkOsMcpFixture({ tls });
    target = await McpIntegrationApp.start({
      environment: { AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS: 'true' },
      logger: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'],
    });
  });

  afterAll(async () => {
    try {
      await target?.close();
      await externalMcp?.close();
      tls?.restoreTrust();
    } finally {
      stdoutWrite?.mockRestore();
      stderrWrite?.mockRestore();
      consoleLog?.mockRestore();
      consoleError?.mockRestore();
      consoleWarn?.mockRestore();
      consoleInfo?.mockRestore();
      consoleDebug?.mockRestore();
      nestLog?.mockRestore();
      nestError?.mockRestore();
      nestWarn?.mockRestore();
      nestDebug?.mockRestore();
      nestVerbose?.mockRestore();
      nestFatal?.mockRestore();
    }
  });

  it('인증과 연결 실패를 포함한 실행 log에 secret 원문을 남기지 않는다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const sessionToken = cookieValue(actor.sessionCookie);
    const secrets = [
      { name: 'password', value: PASSWORD },
      { name: 'session cookie', value: sessionToken },
      { name: 'access key', value: actor.secret },
    ];

    const mcp = await target.connectClient({
      name: 'log-canary-valid-key',
      headers: { Authorization: `Bearer ${actor.secret}` },
    });
    await mcp.client.listTools();
    await mcp.close();

    const rotated = await actor.agent
      .post(`/mcp/access-keys/${actor.keyId}/rotate`)
      .set('Idempotency-Key', 'log-canary-rotate')
      .expect(201);
    const rotatedSecret: string = rotated.body.secret;
    secrets.push({ name: 'rotated access key', value: rotatedSecret });
    await actor.agent
      .delete(`/mcp/access-keys/${rotated.body.key.id}`)
      .expect(204);
    await expect(
      target.connectClient({
        name: 'log-canary-revoked-key',
        headers: { Authorization: `Bearer ${rotatedSecret}` },
      }),
    ).rejects.toThrow();
    const malformedAccessKey = `${rotatedSecret}-malformed`;
    secrets.push({ name: 'malformed access key', value: malformedAccessKey });
    await expect(
      target.connectClient({
        name: 'log-canary-malformed-key',
        headers: { Authorization: `Bearer ${malformedAccessKey}` },
      }),
    ).rejects.toThrow();

    const externalToken = `fixture:${actor.userId}`;
    secrets.push({ name: 'external MCP bearer token', value: externalToken });
    await actor.agent
      .post('/agent/mcp-connections')
      .send({
        displayName: 'Log canary external MCP',
        endpoint: externalMcp.url,
        authKind: 'bearer',
        bearerToken: externalToken,
      })
      .expect(201);

    const rejectedExternalToken = `not-a-fixture-token-${actor.userId}`;
    secrets.push({
      name: 'rejected external MCP bearer token',
      value: rejectedExternalToken,
    });
    await actor.agent
      .post('/agent/mcp-connections')
      .send({
        displayName: 'Rejected log canary external MCP',
        endpoint: externalMcp.url,
        authKind: 'bearer',
        bearerToken: rejectedExternalToken,
      })
      .expect(502);

    for (const environmentKey of [
      'BETTER_AUTH_SECRET',
      'CREDENTIAL_ENCRYPTION_KEYS',
      'COLLABORATION_JWT_SECRET',
      'OLLAMA_API_KEY',
      'GEMINI_API_KEY',
    ]) {
      const value = process.env[environmentKey];
      if (value) secrets.push({ name: environmentKey, value });
    }

    expect(output.length > 0).toBe(true);
    for (const representative of [
      'mcp.policy.provisioned',
      'agent_mcp.connection.created',
      'agent_mcp.discovery.failed',
      'Failed to validate API key',
      'AGENT_MCP_DISCOVERY_FAILED',
    ]) {
      expect({
        present: output.includes(representative),
        representative,
      }).toEqual({ present: true, representative });
    }
    for (const secret of secrets) {
      expect({
        exposed: output.includes(secret.value),
        secret: secret.name,
      }).toEqual({ exposed: false, secret: secret.name });
    }
  });
});

function cookieValue(cookieHeader: string): string {
  const separator = cookieHeader.indexOf('=');
  if (separator < 0)
    throw new Error('session cookie 형식이 올바르지 않습니다.');
  return cookieHeader.slice(separator + 1);
}
