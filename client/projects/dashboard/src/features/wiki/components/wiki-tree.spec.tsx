import type { WikiTree as WikiTreeData } from '@repo/client/api-client/schemas';
import { WikiTree } from '@core/features/wiki/components/wiki-tree';

import { describe, expect, it, jest } from '@jest/globals';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const productFolderId = '11111111-1111-4111-8111-111111111111';
const apiFolderId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';

const tree: WikiTreeData = {
  folders: [
    {
      id: productFolderId,
      organizationId: 'organization-a',
      parentFolderId: null,
      name: '제품',
      position: 0,
      createdByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
    {
      id: apiFolderId,
      organizationId: 'organization-a',
      parentFolderId: productFolderId,
      name: 'API',
      position: 0,
      createdByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
  ],
  documents: [
    {
      id: documentId,
      organizationId: 'organization-a',
      folderId: apiFolderId,
      title: '인증 설계',
      revision: 1,
      createdByUserId: 'user-a',
      updatedByUserId: 'user-a',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
  ],
};

async function renderTree(overrides?: {
  onCreateDocument?: (folderId: string | null) => void;
}) {
  const onCreateDocument = overrides?.onCreateDocument ?? jest.fn();
  await render(
    <WikiTree
      activeDocumentId={documentId}
      drawerOpen={false}
      onCloseDrawer={jest.fn()}
      onCreateDocument={onCreateDocument}
      onCreateFolder={jest.fn()}
      onDeleteItem={jest.fn()}
      onManageItem={jest.fn()}
      onSelectDocument={jest.fn()}
      tree={tree}
    />,
  );
  return { onCreateDocument };
}

describe('위키 트리', () => {
  it('선택 문서의 ancestor를 자동으로 펼치지만 사용자가 다시 접을 수 있다', async () => {
    await renderTree();

    expect(screen.getAllByLabelText('인증 설계 문서 열기')).toHaveLength(2);

    fireEvent.press(screen.getAllByLabelText('제품 폴더 접기')[0]);

    await waitFor(() => {
      expect(screen.queryAllByLabelText('인증 설계 문서 열기')).toHaveLength(0);
    });
  });

  it('폴더의 직접 새 문서 버튼을 유지한다', async () => {
    const onCreateDocument = jest.fn();
    await renderTree({ onCreateDocument });

    fireEvent.press(screen.getAllByLabelText('제품에 새 문서 만들기')[0]);

    expect(onCreateDocument).toHaveBeenCalledWith(productFolderId);
  });
});
