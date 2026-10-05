import type { WikiTreeOutput as WikiTree } from '@repo/client/api-client/schemas';
import {
  findWikiDocumentNode,
  flattenWikiDocuments,
  getWikiDocumentBreadcrumb,
  getWikiDocumentDescendantIds,
  getWikiDocumentPathLabel,
  getWikiExpandedAncestorIds,
  getWikiTreeChildren,
} from '@core/features/wiki/wiki-tree-model';

import { describe, expect, it } from '@jest/globals';

const collectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timestamp = '2026-10-05T00:00:00.000Z';

const tree: WikiTree = {
  documents: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      collectionId,
      organizationId: 'organization-a',
      parentDocumentId: null,
      title: '제품',
      position: 0,
      revision: 1,
      createdByUserId: 'user-a',
      updatedByUserId: 'user-a',
      createdAt: timestamp,
      updatedAt: timestamp,
      children: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          collectionId,
          organizationId: 'organization-a',
          parentDocumentId: '11111111-1111-4111-8111-111111111111',
          title: 'API',
          position: 0,
          revision: 1,
          createdByUserId: 'user-a',
          updatedByUserId: 'user-a',
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              collectionId,
              organizationId: 'organization-a',
              parentDocumentId: '22222222-2222-4222-8222-222222222222',
              title: '인증 설계',
              position: 0,
              revision: 1,
              createdByUserId: 'user-a',
              updatedByUserId: 'user-a',
              createdAt: timestamp,
              updatedAt: timestamp,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      collectionId,
      organizationId: 'organization-a',
      parentDocumentId: null,
      title: 'README',
      position: 1,
      revision: 1,
      createdByUserId: 'user-a',
      updatedByUserId: 'user-a',
      createdAt: timestamp,
      updatedAt: timestamp,
      children: [],
    },
  ],
};

describe('위키 트리 모델', () => {
  it('parent document ancestry로 breadcrumb를 만든다', () => {
    const document = findWikiDocumentNode(
      tree,
      '33333333-3333-4333-8333-333333333333',
    );
    expect(document).not.toBeNull();
    if (!document) return;

    expect(getWikiDocumentBreadcrumb(tree, document)).toEqual([
      { id: 'wiki', kind: 'root', label: '위키' },
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'document',
        label: '제품',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'document',
        label: 'API',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'document',
        label: '인증 설계',
      },
    ]);
  });

  it('선택 문서의 상위 문서를 모두 펼칠 수 있게 반환한다', () => {
    expect(
      getWikiExpandedAncestorIds(tree, '33333333-3333-4333-8333-333333333333'),
    ).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('문서 이동에서 자기 자신과 모든 descendant를 제외할 수 있다', () => {
    const descendants = getWikiDocumentDescendantIds(
      tree,
      '11111111-1111-4111-8111-111111111111',
    );
    expect([...descendants]).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('이동 대상 문서를 전체 ancestry 경로로 구분한다', () => {
    expect(
      getWikiDocumentPathLabel(tree, '33333333-3333-4333-8333-333333333333'),
    ).toBe('제품 / API / 인증 설계');
  });

  it('root와 nested 문서를 parent id 기준으로 파생한다', () => {
    expect(getWikiTreeChildren(tree, null).map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(
      getWikiTreeChildren(tree, '22222222-2222-4222-8222-222222222222').map(
        ({ id }) => id,
      ),
    ).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('재귀 문서 트리를 안정적으로 평탄화한다', () => {
    expect(flattenWikiDocuments(tree).map(({ title }) => title)).toEqual([
      '제품',
      'API',
      '인증 설계',
      'README',
    ]);
  });
});
