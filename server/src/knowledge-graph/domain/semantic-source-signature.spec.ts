import { createHash } from 'node:crypto';

import { SYSTEM_PROMPT } from '@repo/knowledge-graph';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { semanticPipelineDescriptor } from '@/knowledge-graph/domain/semantic-pipeline';
import { computeSemanticSourceSignature } from '@/knowledge-graph/domain/semantic-source-signature';
import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

describe('Wiki 의미 색인의 원본 서명과 모델 공간', () => {
  const snapshot: WikiSemanticSource = {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId: 'semantic-signature-org',
    collectionId: '10000000-0000-4000-8000-000000000002',
    parentDocumentId: null,
    title: '의미 색인',
    position: 0,
    contentMarkdown: '지윤이 기술 결정을 기록한다.',
    updatedAt: new Date('2026-10-09T00:00:00Z'),
  };

  it('U7-01 같은 ms의 두 본문 변경도 서로 다른 서명으로 식별한다', () => {
    expect(computeSemanticSourceSignature(snapshot)).not.toBe(
      computeSemanticSourceSignature({
        ...snapshot,
        contentMarkdown: '다른 결정',
      }),
    );
  });

  it.each([
    { title: '바뀐 제목' },
    { position: 1 },
    { parentDocumentId: '10000000-0000-4000-8000-000000000003' },
  ])('U7-02·03 제목·위치·부모의 실제 변경을 서명에 반영한다: %j', (change) => {
    expect(computeSemanticSourceSignature(snapshot)).not.toBe(
      computeSemanticSourceSignature({ ...snapshot, ...change }),
    );
  });

  it('U7-04 Unicode와 줄바꿈 표현 차이는 같은 서명으로 정규화한다', () => {
    expect(
      computeSemanticSourceSignature({
        ...snapshot,
        contentMarkdown: '한글\r\n본문  ',
      }),
    ).toBe(
      computeSemanticSourceSignature({
        ...snapshot,
        contentMarkdown: '한글\n본문'.normalize('NFD'),
      }),
    );
  });

  it('U7-05 추출·온톨로지·chunker·embedding 설정의 변경은 다른 공간이다', () => {
    const current = digestGraphJson(semanticPipelineDescriptor);
    for (const name of [
      'extractor',
      'ontology',
      'chunker',
      'embedding',
      'storageVersion',
    ]) {
      expect(
        digestGraphJson({ ...semanticPipelineDescriptor, [name]: '변경됨' }),
      ).not.toBe(current);
    }
    expect(semanticPipelineDescriptor.extractor.model).toBe('gpt-oss:120b');
    expect(semanticPipelineDescriptor.embedding.model).toBe(
      'gemini-embedding-2',
    );
    expect(semanticPipelineDescriptor.embedding.dimensions).toBe(768);
    expect(semanticPipelineDescriptor.extractor.promptDigest).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
  it('U7-05 descriptor의모든leaf변경과원본SYSTEM_PROMPT digest를확인한다', () => {
    const original = digestGraphJson(semanticPipelineDescriptor);
    const paths: Array<string[]> = [];
    function walk(value: unknown, path: string[]) {
      if (value !== null && typeof value === 'object')
        for (const key of Object.keys(value))
          walk(Reflect.get(value, key), [...path, key]);
      else paths.push(path);
    }
    walk(semanticPipelineDescriptor, []);
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) {
      const copy = structuredClone(semanticPipelineDescriptor);
      let current: object = copy;
      for (const key of path.slice(0, -1)) {
        const child: unknown = Reflect.get(current, key);
        if (child === null || typeof child !== 'object')
          throw new Error('descriptor 경로가없습니다.');
        current = child;
      }
      Reflect.set(current, path[path.length - 1], '변경된값');
      expect(digestGraphJson(copy)).not.toBe(original);
    }
    expect(semanticPipelineDescriptor.extractor.promptDigest).toBe(
      createHash('sha256').update(SYSTEM_PROMPT).digest('hex'),
    );
  });
});
