import { Test } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { OllamaCloudSemanticExtractorAdapter } from '@/knowledge-graph/infrastructure/extraction/ollama-cloud/ollama-cloud-semantic-extractor.adapter';

import { z } from 'zod';

const BodySchema = z
  .object({
    model: z.literal('gpt-oss:120b'),
    stream: z.literal(true),
    tools: z
      .array(
        z
          .object({
            function: z
              .object({ name: z.literal('extract_graph') })
              .passthrough(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
const valid = { nodes: [{ id: '지윤', type: 'Person' }], relationships: [] };
function response(args = valid) {
  return new Response(
    JSON.stringify({
      model: 'gpt-oss:120b',
      created_at: '2026-10-09T00:00:00Z',
      done: true,
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'extract_graph', arguments: args } }],
      },
      prompt_eval_count: 1,
      eval_count: 1,
    }) + '\n',
    { headers: { 'content-type': 'application/x-ndjson' } },
  );
}

describe('Ollama SDK와 기존 Tool Calling transformer의 실제 HTTP 연결', () => {
  let adapter: OllamaCloudSemanticExtractorAdapter;
  beforeEach(async () => {
    const app = await Test.createTestingModule({
      providers: [
        OllamaCloudSemanticExtractorAdapter,
        {
          provide: knowledgeGraphConfig.KEY,
          useValue: {
            semantic: {
              ollamaBaseUrl: 'https://ollama.com',
              ollamaApiKey: 'test-placeholder-key',
            },
          },
        },
      ],
    }).compile();
    adapter = app.get(OllamaCloudSemanticExtractorAdapter);
  });
  afterEach(() => jest.restoreAllMocks());
  it('U7-10 모델명과Bearer·extract_graph를 유지하고 동시 두문서를 독립적으로 처리한다', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => response());
    const graphs = await Promise.all([
      adapter.extract('첫 문서', 0, new AbortController().signal),
      adapter.extract('둘째 문서', 1, new AbortController().signal),
    ]);
    expect(graphs.map((graph) => graph.nodes.map((node) => node.id))).toEqual([
      ['지윤'],
      ['지윤'],
    ]);
    expect(graphs.map((graph) => graph.source.pageContent)).toEqual([
      '첫 문서',
      '둘째 문서',
    ]);
    expect(fetch.mock.calls.length).toBe(2);
    for (const [input, init] of fetch.mock.calls) {
      expect(new URL(String(input)).href).toBe('https://ollama.com/api/chat');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer test-placeholder-key',
      );
      if (typeof init?.body !== 'string')
        throw new Error('SDK 본문이 없습니다.');
      BodySchema.parse(JSON.parse(init.body));
      expect(init.body.includes('"format"')).toBe(false);
      expect(init.body.includes('"think"')).toBe(false);
    }
  });
  it('U7-11 유효하지 않은 schema는 기존transformer에서1회만 재시도한다', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      response({
        nodes: [{ id: '잘못된 종류', type: 'Admin' }],
        relationships: [],
      }),
    );
    await expect(
      adapter.extract('본문', 0, new AbortController().signal),
    ).rejects.toMatchObject({ reason: 'schema_mismatch' });
    expect(fetch.mock.calls.length).toBe(2);
  });
  it('U7-13 HTTP401은LangChain 내부추가재시도 없이고정코드1회로끝난다', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('private-error-body', { status: 401 }));
    await expect(
      adapter.extract('본문', 0, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAUTHORIZED',
      message: 'PROVIDER_UNAUTHORIZED',
    });
    expect(fetch.mock.calls.length).toBe(1);
  });
});
