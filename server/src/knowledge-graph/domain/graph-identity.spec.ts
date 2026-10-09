import {
  decodeGraphEdgeId,
  decodeGraphNodeId,
  encodeGraphEdgeId,
  encodeGraphNodeId,
  type GraphEdgeIdentity,
  type GraphNodeIdentity,
} from '@/knowledge-graph/domain/graph-identity';

const sourceId = '10000000-0000-4000-8000-000000000001';
const generationId = '10000000-0000-4000-8000-000000000002';
const correctionId = '10000000-0000-4000-8000-000000000003';
const key = 'a'.repeat(64);
const nodeIdentities: GraphNodeIdentity[] = [
  [1, 's', 'wiki_document', sourceId],
  [1, 's', 'member', 'better-auth-user-id'],
  [1, 'c', sourceId],
  [1, 'e', 'wiki_document', sourceId, generationId, key],
];
const edgeIdentities: GraphEdgeIdentity[] = [
  [1, 'r', 'wiki_parent', 'from', 'to'],
  [1, 'ce', sourceId],
  [1, 'sr', sourceId, generationId, key],
  [1, 'm', sourceId, generationId, key],
  [1, 'ar', correctionId],
];

describe('U8-02 그래프 외부 식별자 codec', () => {
  it.each(nodeIdentities.map((identity) => [identity]))(
    '노드 namespace를 왕복한다',
    (identity) => {
      expect(decodeGraphNodeId(encodeGraphNodeId(identity))).toEqual(identity);
    },
  );

  it.each(edgeIdentities.map((identity) => [identity]))(
    '관계 namespace를 왕복한다',
    (identity) => {
      expect(decodeGraphEdgeId(encodeGraphEdgeId(identity))).toEqual(identity);
    },
  );

  it('과도한 길이·잘못된 UUID·알 수 없는 kind·Neo4j elementId 형태를 거부한다', () => {
    expect(() => decodeGraphNodeId('a'.repeat(513))).toThrow();
    expect(() =>
      decodeGraphNodeId(
        Buffer.from(JSON.stringify([1, 's', 'wiki_document', 'bad'])).toString(
          'base64url',
        ),
      ),
    ).toThrow();
    expect(() =>
      decodeGraphNodeId(
        Buffer.from(JSON.stringify([1, 's', 'secret', sourceId])).toString(
          'base64url',
        ),
      ),
    ).toThrow();
    expect(() => decodeGraphNodeId('4:123:0')).toThrow();
  });
});
