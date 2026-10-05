import type { WikiTreeOutput as WikiTreeData } from '@repo/client/api-client/schemas';
import { WikiTree } from '@core/features/wiki/components/wiki-tree';

import { describe, expect, it, jest } from '@jest/globals';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const collectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const productDocumentId = '11111111-1111-4111-8111-111111111111';
const apiDocumentId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-10-05T00:00:00.000Z';

const tree: WikiTreeData = {
  documents: [
    {
      id: productDocumentId,
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
          id: apiDocumentId,
          collectionId,
          organizationId: 'organization-a',
          parentDocumentId: productDocumentId,
          title: 'API',
          position: 0,
          revision: 1,
          createdByUserId: 'user-a',
          updatedByUserId: 'user-a',
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [
            {
              id: documentId,
              collectionId,
              organizationId: 'organization-a',
              parentDocumentId: apiDocumentId,
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
  ],
};

async function renderTree(overrides?: {
  onCreateDocument?: (parentDocumentId: string | null) => void;
  onSelectDocument?: (documentId: string) => void;
}) {
  const onCreateDocument = overrides?.onCreateDocument ?? jest.fn();
  const onSelectDocument = overrides?.onSelectDocument ?? jest.fn();
  await render(
    <WikiTree
      activeDocumentId={documentId}
      drawerOpen={false}
      onCloseDrawer={jest.fn()}
      onCreateDocument={onCreateDocument}
      onDeleteItem={jest.fn()}
      onManageItem={jest.fn()}
      onSelectDocument={onSelectDocument}
      tree={tree}
    />,
  );
  return { onCreateDocument, onSelectDocument };
}

describe('위키 트리', () => {
  it('선택 문서의 상위 문서를 자동으로 펼치지만 사용자가 다시 접을 수 있다', async () => {
    await renderTree();

    expect(screen.getAllByLabelText('인증 설계 문서 열기')).toHaveLength(2);

    fireEvent.press(screen.getAllByLabelText('제품 하위 문서 접기')[0]);

    await waitFor(() => {
      expect(screen.queryAllByLabelText('인증 설계 문서 열기')).toHaveLength(0);
    });
  });

  it('branch 문서도 제목을 눌러 열 수 있다', async () => {
    const onSelectDocument = jest.fn();
    await renderTree({ onSelectDocument });

    fireEvent.press(screen.getAllByLabelText('제품 문서 열기')[0]);

    expect(onSelectDocument).toHaveBeenCalledWith(productDocumentId);
  });

  it('문서의 직접 하위 문서 추가 버튼을 유지한다', async () => {
    const onCreateDocument = jest.fn();
    await renderTree({ onCreateDocument });

    fireEvent.press(screen.getAllByLabelText('제품에 하위 문서 만들기')[0]);

    expect(onCreateDocument).toHaveBeenCalledWith(productDocumentId);
  });
});
