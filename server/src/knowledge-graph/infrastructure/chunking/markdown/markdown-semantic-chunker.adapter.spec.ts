import { semanticEmbeddingText } from '@/knowledge-graph/domain/semantic-generation';
import { MarkdownSemanticChunkerAdapter } from '@/knowledge-graph/infrastructure/chunking/markdown/markdown-semantic-chunker.adapter';
import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

describe('의미 Markdown chunk의 결정성과 비용 상한', () => {
  const source: WikiSemanticSource = {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId: 'p7-chunker',
    collectionId: '10000000-0000-4000-8000-000000000002',
    parentDocumentId: null,
    title: '본문 제목',
    position: 0,
    updatedAt: new Date(0),
    contentMarkdown:
      '# 한국어 문서\n\n| 기술 | 결정 |\n| --- | --- |\n| Neo4j | 사용 |\n\n```ts\nconst graph = true;\n```\n' +
      '한국어 본문과 기술 검토를 기록한다.\n'.repeat(200),
  };
  const chunker = new MarkdownSemanticChunkerAdapter();
  it('U7-06 같은 표·코드·한국어 입력의 chunk 경계는 3회 반복해도 같다', async () => {
    const first = await chunker.chunks(source);
    expect(first.length).toBeGreaterThan(1);
    expect(await chunker.chunks(source)).toEqual(first);
    expect(await chunker.chunks(source)).toEqual(first);
    expect(first.every((chunk) => chunk.length <= 2000)).toBe(true);
  });
  it('U7-07 공백 본문은 0chunk, 문자/48chunk 상한 초과는 전체 실패다', async () => {
    expect(
      await chunker.chunks({ ...source, contentMarkdown: ' \r\n\t' }),
    ).toEqual([]);
    await expect(
      chunker.chunks({ ...source, contentMarkdown: '가'.repeat(120001) }),
    ).rejects.toMatchObject({ code: 'SEMANTIC_SOURCE_TOO_LARGE' });
    await expect(
      chunker.chunks({ ...source, contentMarkdown: '가'.repeat(100000) }),
    ).rejects.toMatchObject({ code: 'SEMANTIC_SOURCE_TOO_LARGE' });
  });
  it('U7-08 자신의 title만 embedding에 넣고 상위 path를 저장하지 않는다', () => {
    expect(semanticEmbeddingText('', '본문')).toBe('title: none | text: 본문');
    expect(semanticEmbeddingText('현재 제목', '본문')).toBe(
      'title: 현재 제목 | text: 본문',
    );
  });
  it('U7-07 본문이 짧아도 긴 제목이 embedding 상한을 넘으면 모델 호출 전에 전체 원본을 거부한다', async () => {
    await expect(
      chunker.chunks({
        ...source,
        title: '가'.repeat(3000),
        contentMarkdown: '짧은 본문',
      }),
    ).rejects.toMatchObject({ code: 'SEMANTIC_SOURCE_TOO_LARGE' });
    await expect(
      chunker.chunks({
        ...source,
        title: '가'.repeat(120001),
        contentMarkdown: '',
      }),
    ).rejects.toMatchObject({ code: 'SEMANTIC_SOURCE_TOO_LARGE' });
  });
  it('U7-07 정확히48 chunk는 허용하고49 chunk는 일부만 반환하지 않고 거부한다', async () => {
    expect(
      await chunker.chunks({ ...source, contentMarkdown: 'a'.repeat(86600) }),
    ).toHaveLength(48);
    await expect(
      chunker.chunks({ ...source, contentMarkdown: 'a'.repeat(88400) }),
    ).rejects.toMatchObject({ code: 'SEMANTIC_SOURCE_TOO_LARGE' });
  });
});
