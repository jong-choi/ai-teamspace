import { createGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-store';

import { describe, expect, test } from '@jest/globals';

describe('그래프 스튜디오 store', () => {
  test('조직마다 새 store가 빈 선택·모달·고정 좌표로 시작한다', () => {
    const first = createGraphStudioStore('org-a');
    first.getState().select({ kind: 'node', id: 'n1' });
    first.getState().pinNode('n1', { x: 10, y: 20 });

    const second = createGraphStudioStore('org-b');
    expect(second.getState()).toMatchObject({
      organizationId: 'org-b',
      selection: null,
      dialog: null,
      pinnedPositions: {},
    });
  });

  test('이미 열린 모달이 있으면 다른 모달을 겹쳐 열지 않는다', () => {
    const store = createGraphStudioStore('org-a');
    store.getState().openDialog({ type: 'node-edit', nodeId: 'n1' });
    store.getState().openDialog({ type: 'edge-create', sourceNodeId: null });
    expect(store.getState().dialog).toEqual({
      type: 'node-edit',
      nodeId: 'n1',
    });

    store.getState().closeDialog();
    store.getState().openDialog({ type: 'edge-create', sourceNodeId: 'n1' });
    expect(store.getState().dialog).toEqual({
      type: 'edge-create',
      sourceNodeId: 'n1',
    });
  });

  test('삭제한 노드의 선택과 고정 좌표만 지운다', () => {
    const store = createGraphStudioStore('org-a');
    store.getState().pinNode('n1', { x: 1, y: 2 });
    store.getState().pinNode('n2', { x: 3, y: 4 });
    store.getState().select({ kind: 'node', id: 'n1' });

    store.getState().forgetNode('n1');
    expect(store.getState().selection).toBeNull();
    expect(store.getState().pinnedPositions).toEqual({ n2: { x: 3, y: 4 } });
  });

  test('다른 대상을 삭제해도 현재 선택은 유지한다', () => {
    const store = createGraphStudioStore('org-a');
    store.getState().select({ kind: 'edge', id: 'e1' });
    store.getState().forgetEdge('e2');
    store.getState().forgetNode('n9');
    expect(store.getState().selection).toEqual({ kind: 'edge', id: 'e1' });
  });
});
