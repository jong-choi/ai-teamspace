import {
  getEdgeGeometry,
  getNodeConnections,
  getParallelOffsets,
  getRenderableEdges,
  hitTestEdge,
  hitTestNode,
} from '@core/features/knowledge-graph/lib/graph-view-model';

const edge = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  directed = true,
) => ({ id, sourceNodeId, targetNodeId, directed });

import { describe, expect, test } from '@jest/globals';

describe('그래프 view-model', () => {
  test('양끝 노드가 없는 ghost edge를 렌더링 대상에서 뺀다', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'missing')];
    expect(
      getRenderableEdges([{ id: 'a' }, { id: 'b' }], edges).map(({ id }) => id),
    ).toEqual(['e1']);
  });

  test('같은 노드 쌍의 parallel edge에 방향과 무관하게 서로 다른 offset을 준다', () => {
    const offsets = getParallelOffsets([
      edge('e1', 'a', 'b'),
      edge('e2', 'b', 'a'),
      edge('e3', 'a', 'c'),
    ]);
    expect(offsets.get('e1')).not.toBe(offsets.get('e2'));
    expect(offsets.get('e3')).toBe(0);
  });

  test('무방향 관계에는 화살표를 그리지 않고 self-loop는 노드 위에 그린다', () => {
    const source = { x: 0, y: 0 };
    expect(
      getEdgeGeometry(
        source,
        { x: 200, y: 0 },
        { directed: false, offset: 0, selfLoop: false },
      ).arrow,
    ).toBeNull();
    const loop = getEdgeGeometry(source, source, {
      directed: true,
      offset: 0,
      selfLoop: true,
    });
    expect(loop.arrow).not.toBeNull();
    expect(loop.label.y).toBeLessThan(source.y);
  });

  test('노드 반경 안을 누르면 노드를, 얇은 선 근처를 누르면 관계를 찾는다', () => {
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);
    expect(hitTestNode(positions, { x: 10, y: 10 })).toBe('a');
    expect(hitTestNode(positions, { x: 150, y: 0 })).toBeNull();

    const geometries = new Map([
      [
        'e1',
        getEdgeGeometry(positions.get('a')!, positions.get('b')!, {
          directed: true,
          offset: 0,
          selfLoop: false,
        }),
      ],
    ]);
    expect(hitTestEdge(geometries, { x: 150, y: 5 }, 1)).toBe('e1');
    expect(hitTestEdge(geometries, { x: 150, y: 40 }, 1)).toBeNull();
  });

  test('선택 노드 기준으로 나가는·들어오는·무방향·자기 관계를 구분한다', () => {
    const connections = getNodeConnections('a', [
      edge('out', 'a', 'b'),
      edge('in', 'c', 'a'),
      edge('both', 'a', 'd', false),
      edge('self', 'a', 'a'),
      edge('other', 'b', 'c'),
    ]);
    expect(
      connections.map(({ edge: { id }, direction, otherNodeId }) => [
        id,
        direction,
        otherNodeId,
      ]),
    ).toEqual([
      ['out', 'outgoing', 'b'],
      ['in', 'incoming', 'c'],
      ['both', 'undirected', 'd'],
      ['self', 'self', 'a'],
    ]);
  });
});
