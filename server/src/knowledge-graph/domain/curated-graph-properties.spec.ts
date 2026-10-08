import { CuratedGraphPropertiesSchema } from '@/knowledge-graph/domain/curated-graph-properties';

describe('사용자 작성 그래프 속성 계약', () => {
  it('표시용 JSON scalar와 bounded 배열을 보존한다', () => {
    const properties = {
      description: '설명',
      weight: 2,
      verified: false,
      note: null,
      tags: ['문서', 1],
    };
    expect(CuratedGraphPropertiesSchema.parse(properties)).toEqual(properties);
  });

  it.each([
    { value: undefined },
    { value: new Date(0) },
    { value: Infinity },
    { value: { nested: true } },
    { value: () => true },
    { '잘못된 키': '값' },
    { value: 'x'.repeat(4_097) },
    { value: Array.from({ length: 65 }, () => 'x') },
  ])('JSON 계약이나 제한을 벗어난 속성은 거부한다: %j', (properties) => {
    expect(CuratedGraphPropertiesSchema.safeParse(properties).success).toBe(
      false,
    );
  });

  it('속성 개수와 UTF-8 크기를 제한한다', () => {
    expect(
      CuratedGraphPropertiesSchema.safeParse(
        Object.fromEntries(
          Array.from({ length: 65 }, (_, index) => [`key${index}`, 'x']),
        ),
      ).success,
    ).toBe(false);
    expect(
      CuratedGraphPropertiesSchema.safeParse({
        first: '가'.repeat(4_000),
        second: '나'.repeat(4_000),
      }).success,
    ).toBe(false);
  });

  it('순환 객체를 재귀 순회하지 않고 거부한다', () => {
    const properties = { cyclic: new Map() };
    properties.cyclic.set('self', properties);
    expect(CuratedGraphPropertiesSchema.safeParse(properties).success).toBe(
      false,
    );
  });
});
