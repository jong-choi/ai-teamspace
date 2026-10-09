import type { GraphSnapshot } from '@repo/client/api-client/generated/schemas/graphSnapshot.zod';
import {
  mergeGraphPositions,
  toGraphLayoutInput,
} from '@core/features/knowledge-graph/components/canvas/graph-canvas-position';
import { graphStatusLabel } from '@core/features/knowledge-graph/hooks/use-progressive-graph-explore';

import { describe, expect, it } from '@jest/globals';

describe('그래프 캔버스 점진 배치', () => {
  it('고정 좌표와 현재 drag 좌표만 자동 배치 위에 덮는다', () => {
    const positions = mergeGraphPositions(
      { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } },
      { a: { x: 50, y: 60 }, removed: { x: 0, y: 0 } },
      { nodeId: 'b', point: { x: 70, y: 80 } },
    );
    expect([...positions.entries()]).toEqual([
      ['a', { x: 50, y: 60 }],
      ['b', { x: 70, y: 80 }],
    ]);
  });

  it('focus와 edge endpoint를 layout 입력으로 보존한다', () => {
    const snapshot: GraphSnapshot = {
      nodes: [],
      edges: [
        {
          id: 'edge-a',
          relation: 'semantic',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b',
          directed: true,
          predicate: 'USES',
          factClass: 'extracted',
          sourceRef: null,
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
            targetKey: 'relation-a',
            targetKind: 'relation',
          },
          projectionState: null,
          completeness: 'complete',
          provenance: null,
          curated: null,
        },
      ],
      truncated: false,
      nextCursor: null,
      completeness: 'complete',
      degradedReasons: [],
    };
    expect(toGraphLayoutInput(snapshot, 'node-a')).toEqual({
      nodeIds: [],
      links: [{ sourceId: 'node-a', targetId: 'node-b' }],
      focusId: 'node-a',
    });
  });

  it('degraded 이유를 전체 결과로 오인하지 않는다', () => {
    const snapshot: GraphSnapshot = {
      nodes: [],
      edges: [],
      truncated: false,
      nextCursor: null,
      completeness: 'degraded',
      degradedReasons: ['graph_unavailable'],
    };
    expect(graphStatusLabel(snapshot)).toBe('부분 결과 · graph_unavailable');
  });
});
