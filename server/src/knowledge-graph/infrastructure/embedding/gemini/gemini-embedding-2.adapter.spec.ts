import { Test } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { GeminiEmbedding2Adapter } from '@/knowledge-graph/infrastructure/embedding/gemini/gemini-embedding-2.adapter';

import { z } from 'zod';

const RequestSchema = z
  .object({
    requests: z.array(
      z
        .object({
          content: z.object({ parts: z.array(z.object({ text: z.string() })) }),
          outputDimensionality: z.literal(768),
        })
        .passthrough(),
    ),
  })
  .passthrough();
const vector = () => [1, ...Array.from({ length: 767 }, () => 0)];

describe('Gemini SDK 입력별 Content와 N→N768 계약', () => {
  let adapter: GeminiEmbedding2Adapter;
  beforeEach(async () => {
    const app = await Test.createTestingModule({
      providers: [
        GeminiEmbedding2Adapter,
        {
          provide: knowledgeGraphConfig.KEY,
          useValue: { semantic: { geminiApiKey: 'test-placeholder-api-key' } },
        },
      ],
    }).compile();
    adapter = app.get(GeminiEmbedding2Adapter);
  });
  afterEach(() => jest.restoreAllMocks());

  it('U7-14 일곱 입력은 서로 다른 Content로 보내고 같은 순서의 일곱 벡터를 받는다', async () => {
    const inputs = Array.from({ length: 7 }, (_, i) => `문장 ${i}`);
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          embeddings: inputs.map((_, index) => ({
            values: [index + 1, ...vector().slice(1)],
          })),
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    expect(
      await adapter.embedDocuments(inputs, new AbortController().signal),
    ).toEqual(inputs.map((_, index) => [index + 1, ...vector().slice(1)]));
    const body = fetch.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string')
      throw new Error('SDK request 본문이 없습니다.');
    const parsed = RequestSchema.parse(JSON.parse(body));
    expect(
      parsed.requests.map((request) =>
        request.content.parts.map((part) => part.text),
      ),
    ).toEqual(inputs.map((input) => [input]));
    expect(body.includes('taskType')).toBe(false);
    expect(body.includes('task_type')).toBe(false);
  });
  it.each(['count', 'dimension', 'zero', 'nonfinite'] as const)(
    'U7-14 %s 위반은 부분 세대를 성공으로 반환하지 않는다',
    async (invalid) => {
      const values =
        invalid === 'dimension'
          ? [1]
          : invalid === 'zero'
            ? Array.from({ length: 768 }, () => 0)
            : invalid === 'nonfinite'
              ? [Number.NaN, ...vector().slice(1)]
              : vector();
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            embeddings: Array.from(
              { length: invalid === 'count' ? 6 : 7 },
              () => ({ values }),
            ),
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
      await expect(
        adapter.embedDocuments(
          Array.from({ length: 7 }, () => '본문'),
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'EMBEDDING_INVALID' });
    },
  );
  it('U7-14 스무 입력은16+4로 나누고 뒤 batch 실패는 앞 결과도 반환하지 않는다', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            embeddings: Array.from({ length: 16 }, () => ({
              values: vector(),
            })),
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 503, message: '비공개 공급자 응답' },
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      );
    await expect(
      adapter.embedDocuments(
        Array.from({ length: 20 }, () => '본문'),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(fetch.mock.calls.length).toBe(2);
    const sizes = fetch.mock.calls.map(([, init]) => {
      if (typeof init?.body !== 'string')
        throw new Error('SDK request 본문이 없습니다.');
      return RequestSchema.parse(JSON.parse(init.body)).requests.length;
    });
    expect(sizes).toEqual([16, 4]);
  });
});
