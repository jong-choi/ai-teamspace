import { View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
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
import type { GraphFixtureNodeListParams } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 node 목록 generated Suspense hook으로 직접 교체한다.
import { useGraphFixtureNodesSuspense } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import { getGraphRecordActions } from '@core/features/knowledge-graph/lib/graph-permission';
import {
  GRAPH_NODE_KIND_META,
  shortGraphId,
} from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import {
  Copy,
  Edit2,
  Eye,
  EyeOff,
  PencilLine,
  Trash2,
} from 'lucide-react-native';

export const GRAPH_NODE_TABLE_COLUMNS: readonly GraphTableColumn[] = [
  { key: 'id', label: 'ID', className: 'w-40' },
  { key: 'title', label: '표시명 (Label)', className: 'min-w-[200px] flex-1' },
  { key: 'kind', label: '카테고리', className: 'w-32' },
  { key: 'source', label: '출처·상태', className: 'w-44' },
  { key: 'position', label: '위치 좌표', className: 'w-32' },
  { key: 'actions', label: '작업', className: 'w-32', align: 'right' },
];

export function GraphNodeTable({
  onCursorChange,
  organizationId,
  params,
}: {
  onCursorChange: (cursor: string | null) => void;
  organizationId: string;
  params: GraphFixtureNodeListParams;
}) {
  const page = useGraphFixtureNodesSuspense(organizationId, params).data;
  const { copyText, notifySuccess } = useDashboardPlatform();
  const selection = useGraphStudioStore((state) => state.selection);
  const select = useGraphStudioStore((state) => state.select);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const pinnedPositions = useGraphStudioStore((state) => state.pinnedPositions);
  const start = page.pageIndex * params.pageSize;

  return (
    <View className="gap-4">
      <GraphTable columns={GRAPH_NODE_TABLE_COLUMNS}>
        {page.items.length === 0 ? (
          <GraphTableEmpty message="검색 조건에 일치하는 노드가 없습니다." />
        ) : (
          page.items.map((node) => {
            const actions = getGraphRecordActions(node);
            const pinned = pinnedPositions[node.id];
            return (
              <GraphTableRow
                key={node.id}
                selected={
                  selection?.kind === 'node' && selection.id === node.id
                }
              >
                <GraphTableCell className="w-40">
                  <Text
                    className="font-mono text-[11px] text-muted-foreground"
                    numberOfLines={1}
                  >
                    {shortGraphId(node.id)}
                  </Text>
                  <GraphRowActionButton
                    icon={Copy}
                    label={`${node.title} ID 복사`}
                    onPress={() =>
                      void copyText(node.id).then(() =>
                        notifySuccess({
                          id: 'knowledge-graph-copy-id',
                          title: 'ID를 복사했습니다',
                        }),
                      )
                    }
                  />
                </GraphTableCell>
                <GraphTableCell className="min-w-[200px] flex-1">
                  <GraphTableTitleButton
                    accessibilityLabel={`${node.title} 노드 상세 보기`}
                    label={node.title}
                    onPress={() => select({ kind: 'node', id: node.id })}
                  />
                </GraphTableCell>
                <GraphTableCell className="w-32">
                  <GraphMetaBadge
                    label={GRAPH_NODE_KIND_META[node.kind].code}
                  />
                </GraphTableCell>
                <GraphTableCell className="w-44 flex-wrap">
                  <GraphFactClassBadge factClass={node.factClass} />
                  <GraphProjectionBadge projection={node.projection} />
                </GraphTableCell>
                <GraphTableCell className="w-32">
                  <Text className="font-mono text-[11px] text-muted-foreground">
                    {pinned ? `x:${pinned.x}, y:${pinned.y}` : '자동 배치'}
                  </Text>
                </GraphTableCell>
                <GraphTableCell align="right" className="w-32 gap-1">
                  <GraphRowActionButton
                    icon={Eye}
                    label={`${node.title} 상세 보기`}
                    onPress={() => select({ kind: 'node', id: node.id })}
                  />
                  {actions.has('edit') ? (
                    <GraphRowActionButton
                      icon={Edit2}
                      label={`${node.title} 수정`}
                      onPress={() =>
                        openDialog({ type: 'node-edit', nodeId: node.id })
                      }
                    />
                  ) : null}
                  {actions.has('correct') ? (
                    <GraphRowActionButton
                      icon={PencilLine}
                      label={`${node.title} 추출 결과 정정`}
                      onPress={() =>
                        openDialog({ type: 'node-correct', nodeId: node.id })
                      }
                    />
                  ) : null}
                  {actions.has('delete') || actions.has('suppress') ? (
                    <GraphRowActionButton
                      destructive
                      icon={actions.has('suppress') ? EyeOff : Trash2}
                      label={`${node.title} ${actions.has('suppress') ? '숨김' : '삭제'}`}
                      onPress={() =>
                        openDialog({ type: 'node-delete', nodeId: node.id })
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
        label={`전체 ${page.totalCount}개 노드 중 ${page.totalCount > 0 ? start + 1 : 0}–${Math.min(start + params.pageSize, page.totalCount)}`}
        nextCursor={page.nextCursor}
        onCursorChange={onCursorChange}
        page={{ index: page.pageIndex, count: page.pageCount }}
        previousCursor={page.previousCursor}
      />
    </View>
  );
}
