import { createHash } from 'node:crypto';

import { GraphDocument, Node, Relationship } from '@repo/knowledge-graph';
import { normalizeSemanticGraph } from '@/knowledge-graph/domain/semantic-graph-normalizer';
import { semanticTextHash } from '@/knowledge-graph/domain/semantic-source-signature';

import { Document } from '@langchain/core/documents';

describe('추출 graph의 source-local 저장 경계', () => {
  const context = {
    scope: {
      organizationId: 'p7-normalizer-org',
      aggregateKind: 'wiki_document',
      aggregateId: '10000000-0000-4000-8000-000000000001',
    },
    generationId: '10000000-0000-4000-8000-000000000002',
    signature: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64),
    sourceUpdatedAt: new Date(0),
    createdAt: new Date(0),
  } as const;
  const source = new Node({
    id: '지윤',
    type: 'Person',
    properties: { organizationId: '공격자 조직' },
  });
  const target = new Node({ id: 'Neo4j', type: 'Technology' });
  const graph = () =>
    new GraphDocument({
      nodes: [source, target],
      relationships: [new Relationship({ source, target, type: 'USES' })],
      source: new Document({ pageContent: '지윤은 Neo4j를 사용한다.' }),
    });
  it('U7-12 동일 이름도 조직·문서·세대가 다르면 다른 key이며 양끝은 rekey를 사용한다', () => {
    const first = normalizeSemanticGraph(
      graph(),
      graph().source.pageContent,
      0,
      context,
      new Map(),
    );
    const other = normalizeSemanticGraph(
      graph(),
      graph().source.pageContent,
      0,
      { ...context, scope: { ...context.scope, organizationId: '다른 조직' } },
      new Map(),
    );
    expect(first.entities[0]?.key).not.toBe(other.entities[0]?.key);
    expect(first.relations[0]).toMatchObject({
      sourceKey: first.entities[0]?.key,
      targetKey: first.entities[1]?.key,
      predicate: 'USES',
    });
    expect(first.entities.every((entity) => entity.key.length === 64)).toBe(
      true,
    );
  });
  it('U7-12 dangling·빈id·허용밖type은 거부하고 동일 노드·관계는 합친다', () => {
    const missing = new Node({ id: '없는 노드', type: 'Person' });
    const input = graph();
    input.nodes.push(
      source,
      new Node({ id: '', type: 'Person' }),
      new Node({ id: '없는 종류', type: 'Admin' }),
    );
    input.relationships.push(
      input.relationships[0],
      new Relationship({ source, target: missing, type: 'USES' }),
    );
    const result = normalizeSemanticGraph(
      input,
      input.source.pageContent,
      0,
      context,
      new Map(),
    );
    expect(result.entities).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.droppedNodes).toBe(2);
    expect(result.droppedRelationships).toBe(1);
  });
  it('U7-30 evidence는 문장에 묶이고 이름이 없으면 chunk digest를 사용한다', () => {
    const counter = new Map<string, number>();
    const first = normalizeSemanticGraph(
      graph(),
      '지윤은 Neo4j를 사용한다.',
      0,
      context,
      counter,
    );
    const second = normalizeSemanticGraph(
      graph(),
      '지윤은 다른 결정을 기록한다.',
      1,
      context,
      counter,
    );
    expect(first.entities[0]?.evidenceDigest).not.toBe(
      second.entities[0]?.evidenceDigest,
    );
    expect(first.entities[0]?.occurrence).toBe(1);
    expect(second.entities[0]?.occurrence).toBe(2);
    const absent = normalizeSemanticGraph(
      graph(),
      '지칭 이름이 없는 본문',
      2,
      context,
      new Map(),
    );
    expect(absent.entities[0]?.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(absent.entities[0]?.evidenceDigest).toBe(
      createHash('sha256')
        .update(`chunk:${semanticTextHash('지칭 이름이 없는 본문')}`)
        .digest('hex'),
    );
  });
  it('보정 anchor의 extractor fingerprint는 embedding 공간만 바뀌어도 유지한다', () => {
    const first = normalizeSemanticGraph(
      graph(),
      graph().source.pageContent,
      0,
      context,
      new Map(),
    );
    const changed = normalizeSemanticGraph(
      graph(),
      graph().source.pageContent,
      0,
      {
        ...context,
        fingerprint: 'c'.repeat(64),
        generationId: '10000000-0000-4000-8000-000000000003',
      },
      new Map(),
    );
    expect(first.entities[0]?.extractorFingerprint).toBe(
      changed.entities[0]?.extractorFingerprint,
    );
    expect(first.entities[0]?.evidenceDigest).toBe(
      changed.entities[0]?.evidenceDigest,
    );
    expect(first.entities[0]?.key).not.toBe(changed.entities[0]?.key);
  });
  it('U7-30 이름이 없는 fallback은 occurrence1이며 뒤의 실제 문장 counter를 소모하지 않는다', () => {
    const counter = new Map<string, number>();
    const first = normalizeSemanticGraph(
      graph(),
      '별칭만 있는 본문',
      0,
      context,
      counter,
    );
    const second = normalizeSemanticGraph(
      graph(),
      '다른 별칭만 있는 본문',
      1,
      context,
      counter,
    );
    const present = normalizeSemanticGraph(
      graph(),
      '지윤은 Neo4j를 사용한다.',
      2,
      context,
      counter,
    );
    expect(first.entities.map((entity) => entity.occurrence)).toEqual([1, 1]);
    expect(second.entities.map((entity) => entity.occurrence)).toEqual([1, 1]);
    expect(present.entities.map((entity) => entity.occurrence)).toEqual([1, 1]);
    expect(present.entities[0]?.evidenceDigest).toBe(
      createHash('sha256').update('지윤은 Neo4j를 사용한다.').digest('hex'),
    );
  });
  it('U7-12 200자 경계·과다id·공백과구분자·허용 type은 키 주입 없이 처리한다', () => {
    const accepted = new Node({ id: '가'.repeat(200), type: 'Person' });
    const injected = new Node({
      id: '  NEO  4J | 문서:다른조직  ',
      type: 'Technology',
      properties: { key: '위조', organizationId: '위조' },
    });
    const input = new GraphDocument({
      nodes: [
        accepted,
        injected,
        new Node({ id: '나'.repeat(201), type: 'Person' }),
        new Node({ id: '  ', type: 'Person' }),
      ],
      relationships: [],
      source: new Document({ pageContent: '경계 입력' }),
    });
    const result = normalizeSemanticGraph(
      input,
      input.source.pageContent,
      0,
      context,
      new Map(),
    );
    expect(result.entities).toHaveLength(2);
    expect(result.droppedNodes).toBe(2);
    expect(result.entities[1]?.normalizedName).toBe('neo 4j | 문서:다른조직');
    expect(result.entities[1]?.key).toMatch(/^[0-9a-f]{64}$/);
    injected.properties = {};
    expect(
      normalizeSemanticGraph(
        input,
        input.source.pageContent,
        0,
        context,
        new Map(),
      ).entities[1]?.key,
    ).toBe(result.entities[1]?.key);
  });
});
