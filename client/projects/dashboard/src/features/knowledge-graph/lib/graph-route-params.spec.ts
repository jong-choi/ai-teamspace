import {
  parseGraphDataCenterParams,
  parseGraphExploreParams,
  toGraphDataCenterSearchParams,
} from '@core/features/knowledge-graph/lib/graph-route-params';

import { describe, expect, test } from '@jest/globals';

describe('지식 그래프 route param', () => {
  test('값이 없거나 허용되지 않은 값이면 기본 탭·필터·페이지 크기를 쓴다', () => {
    expect(
      parseGraphDataCenterParams({ tab: 'unknown', kind: 'Person', size: '7' }),
    ).toEqual({
      tab: 'nodes',
      search: '',
      kind: 'all',
      relation: 'all',
      pageSize: 10,
      cursor: null,
    });
  });

  test('URL 값과 데이터 센터 상태를 왕복해도 같은 값이 된다', () => {
    const params = parseGraphDataCenterParams({
      tab: 'edges',
      q: 'neo4j',
      kind: 'technology',
      relation: 'mentions',
      size: '20',
      cursor: '2',
    });
    expect(
      parseGraphDataCenterParams(toGraphDataCenterSearchParams(params)),
    ).toEqual(params);
  });

  test('기본값은 URL에서 생략한다', () => {
    expect(
      toGraphDataCenterSearchParams(parseGraphDataCenterParams({})),
    ).toEqual({
      tab: undefined,
      q: undefined,
      kind: undefined,
      relation: undefined,
      size: undefined,
      cursor: undefined,
    });
  });

  test('focus deep link는 id가 있을 때만 쓰고 모르는 kind는 버린다', () => {
    expect(parseGraphExploreParams({ focusKind: 'wiki_document' })).toEqual({});
    expect(
      parseGraphExploreParams({ focusKind: 'raw_label', focusId: 'doc-1' }),
    ).toEqual({
      focusId: 'doc-1',
      focusKind: undefined,
    });
    expect(
      parseGraphExploreParams({
        focusKind: 'wiki_document',
        focusId: ['doc-1', 'doc-2'],
      }),
    ).toEqual({
      focusId: 'doc-1',
      focusKind: 'wiki_document',
    });
  });
});
