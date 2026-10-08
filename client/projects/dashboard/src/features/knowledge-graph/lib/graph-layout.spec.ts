import {
  clampZoom,
  fitViewport,
  getGraphBounds,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  layoutGraph,
  resetViewport,
  toWorldPoint,
  zoomViewportAt,
} from '@core/features/knowledge-graph/lib/graph-layout';

const input = {
  nodeIds: ['a', 'b', 'c', 'd'],
  links: [
    { sourceId: 'a', targetId: 'b' },
    { sourceId: 'a', targetId: 'c' },
    { sourceId: 'c', targetId: 'd' },
  ],
  focusId: 'a',
};

import { describe, expect, test } from '@jest/globals';

describe('그래프 레이아웃', () => {
  test('같은 입력에는 항상 같은 좌표를 낸다', () => {
    expect(layoutGraph(input)).toEqual(layoutGraph(input));
  });

  test('모든 노드에 유한한 좌표를 주고 서로 겹치지 않게 배치한다', () => {
    const positions = layoutGraph(input);
    const points = Object.values(positions);
    expect(Object.keys(positions).sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    for (const [index, point] of points.entries()) {
      for (const other of points.slice(index + 1)) {
        expect(
          Math.hypot(point.x - other.x, point.y - other.y),
        ).toBeGreaterThan(44);
      }
    }
  });

  test('이전 좌표가 있는 노드는 그대로 두고 새 노드만 배치한다', () => {
    const previous = layoutGraph(input);
    const next = layoutGraph(
      {
        ...input,
        nodeIds: [...input.nodeIds, 'e'],
        links: [...input.links, { sourceId: 'd', targetId: 'e' }],
      },
      previous,
    );
    for (const id of input.nodeIds) {
      expect(next[id]).toEqual(previous[id]);
    }
    expect(next.e).toBeDefined();
  });

  test('없는 노드를 가리키는 링크와 빈 그래프를 안전하게 처리한다', () => {
    expect(layoutGraph({ nodeIds: [], links: [], focusId: null })).toEqual({});
    const positions = layoutGraph({
      nodeIds: ['a'],
      links: [{ sourceId: 'a', targetId: 'ghost' }],
      focusId: 'ghost',
    });
    expect(Object.keys(positions)).toEqual(['a']);
  });
});

describe('그래프 뷰포트', () => {
  const size = { width: 800, height: 600 };

  test('배율을 0.4~2.5로 제한하고 NaN은 100%로 되돌린다', () => {
    expect(clampZoom(10)).toBe(GRAPH_MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(GRAPH_MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  test('화면 맞춤은 모든 노드 bounds를 캔버스 안에 가운데 놓는다', () => {
    const bounds = getGraphBounds([
      { x: -400, y: -100 },
      { x: 600, y: 300 },
    ]);
    const viewport = fitViewport(bounds, size);
    expect(bounds).not.toBeNull();
    const topLeft = {
      x: bounds!.minX * viewport.scale + viewport.x,
      y: bounds!.minY * viewport.scale + viewport.y,
    };
    const bottomRight = {
      x: bounds!.maxX * viewport.scale + viewport.x,
      y: bounds!.maxY * viewport.scale + viewport.y,
    };
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(size.width);
    expect(bottomRight.y).toBeLessThanOrEqual(size.height);
  });

  test('빈 그래프나 0 크기 캔버스에서도 나눗셈 오류 없이 원점으로 되돌린다', () => {
    expect(fitViewport(null, size)).toEqual(resetViewport(size));
    const zero = fitViewport(getGraphBounds([{ x: 0, y: 0 }]), {
      width: 0,
      height: 0,
    });
    expect(Object.values(zero).every(Number.isFinite)).toBe(true);
  });

  test('focal point의 world 좌표를 유지하며 확대한다', () => {
    const viewport = { x: 120, y: 80, scale: 1 };
    const focal = { x: 300, y: 200 };
    const before = toWorldPoint(viewport, focal);
    const after = toWorldPoint(zoomViewportAt(viewport, 2, focal), focal);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
