import { isGraphAccessLoss } from '@core/features/knowledge-graph/hooks/use-knowledge-graph-mutation-error';

import { describe, expect, it } from '@jest/globals';

describe('지식 그래프 편집 중 접근권한 상실', () => {
  it.each([403, 404])(
    '%i 응답은 편집 cache 폐기 대상으로 판정한다',
    (status) => {
      expect(
        isGraphAccessLoss({
          type: 'about:blank',
          title: '접근할 수 없습니다',
          status,
        }),
      ).toBe(true);
    },
  );

  it('인가 저장소 장애도 fail-closed cache 폐기 대상으로 판정한다', () => {
    expect(
      isGraphAccessLoss({
        type: 'about:blank',
        title: '인가를 확인할 수 없습니다',
        status: 503,
        errorCode: 'KG_AUTHORIZATION_UNAVAILABLE',
      }),
    ).toBe(true);
  });

  it('revision 충돌은 최신 상세를 다시 볼 수 있도록 cache를 유지한다', () => {
    expect(
      isGraphAccessLoss({
        type: 'about:blank',
        title: '리비전 충돌',
        status: 409,
        errorCode: 'KG_CURATED_REVISION_CONFLICT',
      }),
    ).toBe(false);
  });
});
