import { View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import {
  GraphPagination,
  GraphRowActionButton,
  GraphTable,
  GraphTableCell,
  type GraphTableColumn,
  GraphTableEmpty,
  GraphTableRow,
  GraphTableTitleButton,
} from '@core/features/knowledge-graph/components/data-center/graph-table';
import {
  GraphFactClassBadge,
  GraphMetaBadge,
  GraphProjectionBadge,
} from '@core/features/knowledge-graph/components/graph-badges';
import type { GraphFixtureEdgeListParams } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 edge 목록 generated Suspense hook으로 직접 교체한다.
import { useGraphFixtureEdgesSuspense } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import { getGraphRecordActions } from '@core/features/knowledge-graph/lib/graph-permission';
import { formatPredicate } from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { Edit2, Eye, EyeOff, Trash2 } from 'lucide-react-native';

export const GRAPH_EDGE_TABLE_COLUMNS: readonly GraphTableColumn[] = [
  {
    key: 'source',
    label: '출발 노드 (Source)',
    className: 'min-w-[180px] flex-1',
  },
  { key: 'predicate', label: '관계 서술어 (Predicate)', className: 'w-44' },
  {
    key: 'target',
    label: '도착 노드 (Target)',
    className: 'min-w-[180px] flex-1',
  },
  { key: 'status', label: '출처·상태', className: 'w-44' },
  { key: 'actions', label: '작업', className: 'w-28', align: 'right' },
];

export function GraphEdgeTable({
  onCursorChange,
  organizationId,
  params,
}: {
  onCursorChange: (cursor: string | null) => void;
  organizationId: string;
  params: GraphFixtureEdgeListParams;
}) {
  const page = useGraphFixtureEdgesSuspense(organizationId, params).data;
  const selection = useGraphStudioStore((state) => state.selection);
  const select = useGraphStudioStore((state) => state.select);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const start = page.pageIndex * params.pageSize;

  return (
    <View className="gap-4">
      <GraphTable columns={GRAPH_EDGE_TABLE_COLUMNS}>
        {page.items.length === 0 ? (
          <GraphTableEmpty message="검색 조건에 일치하는 관계가 없습니다." />
        ) : (
          page.items.map((edge) => {
            const actions = getGraphRecordActions(edge);
            const label = `${edge.sourceNode.title} ${formatPredicate(edge.predicate)} ${edge.targetNode.title}`;
            return (
              <GraphTableRow
                key={edge.id}
                selected={
                  selection?.kind === 'edge' && selection.id === edge.id
                }
              >
                <GraphTableCell className="min-w-[180px] flex-1">
                  <GraphTableTitleButton
                    accessibilityLabel={`${label} 관계 상세 보기`}
                    label={edge.sourceNode.title}
                    mono
                    onPress={() => select({ kind: 'edge', id: edge.id })}
                  />
                </GraphTableCell>
                <GraphTableCell className="w-44">
                  <GraphMetaBadge
                    label={`${formatPredicate(edge.predicate)}${edge.directed ? '' : ' ↔'}`}
                    mono
                  />
                </GraphTableCell>
                <GraphTableCell className="min-w-[180px] flex-1">
                  <Text className="font-mono text-[11px]" numberOfLines={1}>
                    {edge.targetNode.title}
                  </Text>
                </GraphTableCell>
                <GraphTableCell className="w-44 flex-wrap">
                  <GraphFactClassBadge factClass={edge.factClass} />
                  <GraphProjectionBadge projection={edge.projection} />
                </GraphTableCell>
                <GraphTableCell align="right" className="w-28 gap-1">
                  <GraphRowActionButton
                    icon={Eye}
                    label={`${label} 상세 보기`}
                    onPress={() => select({ kind: 'edge', id: edge.id })}
                  />
                  {actions.has('edit') ? (
                    <GraphRowActionButton
                      icon={Edit2}
                      label={`${label} 수정`}
                      onPress={() =>
                        openDialog({ type: 'edge-edit', edgeId: edge.id })
                      }
                    />
                  ) : null}
                  {actions.has('delete') || actions.has('suppress') ? (
                    <GraphRowActionButton
                      destructive
                      icon={actions.has('suppress') ? EyeOff : Trash2}
                      label={`${label} ${actions.has('suppress') ? '숨김' : '삭제'}`}
                      onPress={() =>
                        openDialog({ type: 'edge-delete', edgeId: edge.id })
                      }
                    />
                  ) : null}
                </GraphTableCell>
              </GraphTableRow>
            );
          })
        )}
      </GraphTable>

      <GraphPagination
        label={`전체 ${page.totalCount}개 관계 중 ${page.totalCount > 0 ? start + 1 : 0}–${Math.min(start + params.pageSize, page.totalCount)}`}
        nextCursor={page.nextCursor}
        onCursorChange={onCursorChange}
        page={{ index: page.pageIndex, count: page.pageCount }}
        previousCursor={page.previousCursor}
      />
    </View>
  );
}
