import { graphPermissions } from '@/knowledge-graph/domain/graph-read-contract';

describe('U8-09 그래프 편집 권한', () => {
  it('authoritative 원본은 그래프 generic 편집 권한을 주지 않는다', () => {
    expect(
      graphPermissions({
        factClass: 'authoritative',
        canWriteSource: true,
        canManageCurated: true,
      }),
    ).toEqual({
      canEdit: false,
      canDelete: false,
      canCorrect: false,
      canSuppress: false,
    });
  });

  it('extracted와 curated와 asserted 보정의 소유 권한을 구분한다', () => {
    expect(
      graphPermissions({
        factClass: 'extracted',
        canWriteSource: true,
        canManageCurated: false,
      }),
    ).toMatchObject({ canCorrect: true, canSuppress: true });
    expect(
      graphPermissions({
        factClass: 'user_curated',
        canWriteSource: false,
        canManageCurated: true,
      }),
    ).toMatchObject({ canEdit: true, canDelete: true });
    expect(
      graphPermissions({
        factClass: 'user_curated',
        canWriteSource: true,
        canManageCurated: false,
        assertedCorrection: true,
      }),
    ).toMatchObject({ canEdit: false, canDelete: true });
  });
});
