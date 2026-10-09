import { SemanticVectorIndexSchema } from '@/knowledge-graph/infrastructure/graph/semantic-vector-index';

describe('의미 벡터 인덱스의 저장 정의 검증', () => {
  const index = {
    type: 'VECTOR',
    labelsOrTypes: ['KGSemanticChunk'],
    properties: ['embedding'],
    dimension: '768',
    similarity: 'COSINE',
  };
  it('CE가 문자열로 반환하는768차원 인덱스를 허용한다', () => {
    expect(SemanticVectorIndexSchema.parse([index])[0]?.dimension).toBe(768);
  });
  it.each([
    { dimension: '384' },
    { type: 'RANGE' },
    { labelsOrTypes: ['다른노드'] },
    { properties: ['다른속성'] },
    { similarity: 'euclidean' },
  ])('같은 이름이어도 다른 정의는 거부한다: %j', (change) => {
    expect(
      SemanticVectorIndexSchema.safeParse([{ ...index, ...change }]).success,
    ).toBe(false);
  });
  it('인덱스가 없거나 여러 정의를 반환하면 거부한다', () => {
    expect(SemanticVectorIndexSchema.safeParse([]).success).toBe(false);
    expect(SemanticVectorIndexSchema.safeParse([index, index]).success).toBe(
      false,
    );
  });
});
