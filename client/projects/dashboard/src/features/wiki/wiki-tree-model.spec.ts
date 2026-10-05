import type { WikiTree } from '@repo/client/api-client/schemas';
import {
  getWikiDocumentBreadcrumb,
  getWikiExpandedAncestorIds,
  getWikiFolderDescendantIds,
  getWikiFolderPathLabel,
  getWikiTreeChildren,
} from '@core/features/wiki/wiki-tree-model';

import { describe, expect, it } from '@jest/globals';

const tree: WikiTree = {
  folders: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      organizationId: 'organization-a',
      parentFolderId: null,
      name: '제품',
      position: 0,
      createdByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: 'organization-a',
      parentFolderId: '11111111-1111-4111-8111-111111111111',
      name: 'API',
      position: 0,
      createdByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
  ],
  documents: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      organizationId: 'organization-a',
      folderId: '22222222-2222-4222-8222-222222222222',
      title: '인증 설계',
      revision: 1,
      createdByUserId: 'user-a',
      updatedByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      organizationId: 'organization-a',
      folderId: null,
      title: 'README',
      revision: 1,
      createdByUserId: 'user-a',
      updatedByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
  ],
};

describe('위키 트리 모델', () => {
  it('실제 folder ancestry로 breadcrumb를 만든다', () => {
    expect(getWikiDocumentBreadcrumb(tree, tree.documents[0])).toEqual([
      { id: 'wiki', kind: 'root', label: '위키' },
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'folder',
        label: '제품',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'folder',
        label: 'API',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'document',
        label: '인증 설계',
      },
    ]);
  });

  it('선택 문서의 상위 폴더를 모두 펼칠 수 있게 반환한다', () => {
    expect(
      getWikiExpandedAncestorIds(tree, '33333333-3333-4333-8333-333333333333'),
    ).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('폴더 이동에서 자기 자신과 모든 descendant를 제외할 수 있다', () => {
    const descendants = getWikiFolderDescendantIds(
      tree,
      '11111111-1111-4111-8111-111111111111',
    );
    expect([...descendants]).toEqual(['22222222-2222-4222-8222-222222222222']);
  });

  it('이동 대상 폴더를 전체 ancestry 경로로 구분한다', () => {
    expect(
      getWikiFolderPathLabel(tree, '22222222-2222-4222-8222-222222222222'),
    ).toBe('제품 / API');
  });

  it('root와 nested 항목을 parent id 기준으로 파생한다', () => {
    expect(getWikiTreeChildren(tree, null)).toEqual({
      folders: [tree.folders[0]],
      documents: [tree.documents[1]],
    });
    expect(
      getWikiTreeChildren(tree, '22222222-2222-4222-8222-222222222222'),
    ).toEqual({
      folders: [],
      documents: [tree.documents[0]],
    });
  });
});
