import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(absolute)));
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.integration.ts')
    ) {
      files.push(absolute);
    }
  }

  return files;
}

async function readSources(files: string[]): Promise<string> {
  return (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join(
    '\n',
  );
}

describe('Agent runtime 아키텍처 경계', () => {
  const repoRoot = path.resolve(process.cwd(), '../..');
  const runtimeSource = path.join(repoRoot, 'packages/agent-runtime/src');
  const productAgentSource = path.join(repoRoot, 'server/src/agent');

  test('runtime production source가 제품/인증/MCP/DeepAgent 구현을 import하지 않는다', async () => {
    const source = await readSources(await sourceFiles(runtimeSource));

    expect(source).not.toContain('#server/');
    expect(source).not.toContain('server/src/');
    expect(source).not.toContain('better-auth');
    expect(source).not.toContain('@thallesp/nestjs-better-auth');
    expect(source).not.toContain('deepagents');
    expect(source).not.toContain('@langchain/mcp-adapters');
  });

  test('runtime 구현을 package 안에서 소유하고 외부 runtime package에 의존하지 않는다', async () => {
    const source = await readSources(await sourceFiles(runtimeSource));
    const manifest = JSON.parse(
      await readFile(
        path.join(repoRoot, 'packages/agent-runtime/package.json'),
        'utf8',
      ),
    ) as { dependencies?: Record<string, string> };
    const externalRuntimeScope = ['@', 'skein', '-js/'].join('');

    expect(source).not.toContain(externalRuntimeScope);
    expect(
      Object.keys(manifest.dependencies ?? {}).some((dependency) =>
        dependency.startsWith(externalRuntimeScope),
      ),
    ).toBe(false);
  });

  test('제품 Agent feature가 runtime 내부 경로와 AI Teamspace domain persistence를 우회하지 않는다', async () => {
    const source = await readSources(await sourceFiles(productAgentSource));

    expect(source).not.toMatch(/@repo\/agent-runtime\//);
    expect(source).not.toContain('packages/agent-runtime/src');
    expect(source).not.toMatch(
      /#server\/(?:organizations|wiki|chat|database|projects|calendar)\//,
    );
    expect(source).not.toContain('drizzle-orm');
    expect(source).not.toContain('createInMemoryAgentRuntimeDeps');
  });

  test('제품 Agent production source가 assertion patch와 fake state actor를 사용하지 않는다', async () => {
    const source = await readSources(await sourceFiles(productAgentSource));

    expect(source).not.toContain('as never');
    expect(source).not.toContain('as unknown as');
    expect(source).not.toContain('__state_read__');
  });

  test('AgentModule은 composition만 하고 환경/runtime 조립을 직접 소유하지 않는다', async () => {
    const moduleSource = await readFile(
      path.join(productAgentSource, 'agent.module.ts'),
      'utf8',
    );

    expect(moduleSource).not.toContain('process.env');
    expect(moduleSource).not.toContain('parseAgentEnvironment');
    expect(moduleSource).not.toContain('createDurableAgentRuntime');
    expect(moduleSource).not.toMatch(/new\s+[A-Z]/);
  });

  test('application 계층은 DeepAgent/MCP SDK를 직접 import하지 않는다', async () => {
    const applicationSource = await readSources(
      await sourceFiles(path.join(productAgentSource, 'application')),
    );

    expect(applicationSource).not.toContain("from 'deepagents'");
    expect(applicationSource).not.toContain('@langchain/mcp-adapters');
  });

  test('external capability port는 Nest DI token으로 쓸 abstract class다', async () => {
    const ports = await Promise.all(
      [
        'infrastructure/auth/agent-identity.provider.ts',
        'infrastructure/model/agent-model.provider.ts',
        'infrastructure/mcp/mcp-credential.provider.ts',
        'infrastructure/mcp/teamspace-tool-session.provider.ts',
      ].map((relativePath) =>
        readFile(path.join(productAgentSource, relativePath), 'utf8'),
      ),
    );

    for (const source of ports) {
      expect(source).toContain('export abstract class');
    }
  });
});
