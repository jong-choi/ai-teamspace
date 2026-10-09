import { getGraphRecordActions } from '@core/features/knowledge-graph/lib/graph-permission';

import { describe, expect, it } from '@jest/globals';

describe('지식 그래프 record 작업 권한', () => {
  it('authoritative 원본은 지원하는 owner 화면만 연다', () => {
    expect(
      getGraphRecordActions({
        factClass: 'authoritative',
        permissions: {
          canEdit: false,
          canDelete: false,
          canCorrect: false,
          canSuppress: false,
        },
        editTarget: {
          kind: 'owner',
          ownerKind: 'project',
          sourceId: 'project-a',
        },
      }),
    ).toEqual(new Set(['open-source']));
  });

  it('AI 추출 결과에는 서버가 허용한 정정·숨김만 노출한다', () => {
    expect(
      getGraphRecordActions({
        factClass: 'extracted',
        permissions: {
          canEdit: false,
          canDelete: false,
          canCorrect: true,
          canSuppress: true,
        },
        editTarget: {
          kind: 'semantic_correction',
          sourceId: '11111111-1111-4111-8111-111111111111',
          generationId: '22222222-2222-4222-8222-222222222222',
          targetKey: 'entity-a',
          targetKind: 'entity',
        },
      }),
    ).toEqual(new Set(['correct', 'suppress']));
  });

  it('curated 결과에는 서버 permission의 편집·삭제만 노출한다', () => {
    expect(
      getGraphRecordActions({
        factClass: 'user_curated',
        permissions: {
          canEdit: true,
          canDelete: false,
          canCorrect: false,
          canSuppress: false,
        },
        editTarget: {
          kind: 'curated_node',
          nodeId: '33333333-3333-4333-8333-333333333333',
          revision: 1,
        },
      }),
    ).toEqual(new Set(['edit']));
  });
});
