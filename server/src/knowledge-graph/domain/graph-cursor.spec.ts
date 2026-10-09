import {
  decodeGraphCursor,
  encodeGraphCursor,
  graphCursorFilterDigest,
} from '@/knowledge-graph/domain/graph-cursor';

describe('U8-03 그래프 cursor codec', () => {
  it('같은 조직·filter·sort·limit 범위에서 왕복한다', () => {
    const filterDigest = graphCursorFilterDigest({
      organizationId: 'organization-a',
      kind: 'wiki_document',
      sort: 'title',
      limit: 10,
    });
    const encoded = encodeGraphCursor({
      v: 1,
      endpoint: 'nodes',
      filterDigest,
      after: { kind: 'wiki_document', title: '문서', id: 'node-id' },
    });

    expect(
      decodeGraphCursor(encoded, { endpoint: 'nodes', filterDigest }),
    ).toMatchObject({ endpoint: 'nodes', after: { id: 'node-id' } });
  });

  it('조직·filter·sort·limit 또는 endpoint가 달라진 cursor를 거부한다', () => {
    const original = graphCursorFilterDigest({
      organizationId: 'organization-a',
      limit: 10,
    });
    const encoded = encodeGraphCursor({
      v: 1,
      endpoint: 'edges',
      filterDigest: original,
      after: { relation: 'curated', id: 'edge-id' },
    });

    expect(() =>
      decodeGraphCursor(encoded, {
        endpoint: 'edges',
        filterDigest: graphCursorFilterDigest({
          organizationId: 'organization-b',
          limit: 10,
        }),
      }),
    ).toThrow('조회 범위');
    expect(() =>
      decodeGraphCursor(encoded, {
        endpoint: 'nodes',
        filterDigest: original,
      }),
    ).toThrow('조회 범위');
  });
});
