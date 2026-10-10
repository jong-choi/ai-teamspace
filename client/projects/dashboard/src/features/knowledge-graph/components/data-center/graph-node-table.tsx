import { useState } from 'react';
import { View } from 'react-native';

import { useKnowledgeGraphControllerListNodesSuspense } from '@repo/client/api-client';
import type { KnowledgeGraphControllerListNodesParams } from '@repo/client/api-client/generated/schemas/knowledgeGraphControllerListNodesParams.zod';
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
  params: KnowledgeGraphControllerListNodesParams;
}) {
  const page = useKnowledgeGraphControllerListNodesSuspense(
    organizationId,
    params,
  ).data;
  const { copyText, notifySuccess } = useDashboardPlatform();
  const selection = useGraphStudioStore((state) => state.selection);
  const select = useGraphStudioStore((state) => state.select);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const pinnedPositions = useGraphStudioStore((state) => state.pinnedPositions);
  const scope = `${params.q ?? ''}:${params.kind ?? ''}:${params.limit ?? 50}`;
  const [navigation, setNavigation] = useState<{
    scope: string;
    previous: Array<string | null>;
  }>({
    scope,
    previous: [],
  });
  if (navigation.scope !== scope) {
    setNavigation({ scope, previous: [] });
  }
  const pageSize = params.limit ?? 50;
  const start = navigation.previous.length * pageSize;

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
                    className="font-mono text-xs text-muted-foreground"
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
                  <GraphProjectionBadge projection={node.projectionState} />
                </GraphTableCell>
                <GraphTableCell className="w-32">
                  <Text className="font-mono text-xs text-muted-foreground">
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
        canPrevious={navigation.previous.length > 0}
        label={
          page.totalCount === null
            ? `전체 수 미확정 · 현재 ${page.items.length}개 노드`
            : `전체 ${page.totalCount}개 노드 중 ${page.totalCount > 0 ? start + 1 : 0}–${Math.min(start + pageSize, page.totalCount)}`
        }
        nextCursor={page.nextCursor}
        onNext={() => {
          if (!page.nextCursor) return;
          setNavigation((current) => ({
            ...current,
            previous: [...current.previous, params.cursor ?? null],
          }));
          onCursorChange(page.nextCursor);
        }}
        onPrevious={() => {
          const previous = navigation.previous.at(-1) ?? null;
          setNavigation((current) => ({
            ...current,
            previous: current.previous.slice(0, -1),
          }));
          onCursorChange(previous);
        }}
        pageIndex={navigation.previous.length}
      />
    </View>
  );
}
