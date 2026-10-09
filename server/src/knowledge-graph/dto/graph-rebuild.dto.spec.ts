import {
  GraphRebuildCreateSchema,
  GraphRebuildListQuerySchema,
} from '@/knowledge-graph/dto/graph-rebuild.dto';

describe('U8-07 rebuild DTO strict', () => {
  it.each(['projection_repair', 'semantic_reindex', 'full'] as const)(
    '허용 mode %s만 접수한다',
    (mode) => {
      expect(GraphRebuildCreateSchema.parse({ mode })).toEqual({ mode });
    },
  );

  it('알 수 없는 mode와 추가 필드를 거부한다', () => {
    expect(() => GraphRebuildCreateSchema.parse({ mode: 'raw' })).toThrow();
    expect(() =>
      GraphRebuildCreateSchema.parse({ mode: 'full', force: true }),
    ).toThrow();
  });

  it('최근 목록 limit 기본값과 범위를 강제한다', () => {
    expect(GraphRebuildListQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(GraphRebuildListQuerySchema.parse({ limit: '50' })).toEqual({
      limit: 50,
    });
    expect(() => GraphRebuildListQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => GraphRebuildListQuerySchema.parse({ limit: 51 })).toThrow();
  });
});
