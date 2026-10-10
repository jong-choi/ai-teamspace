import { Suspense, useState } from 'react';
import { View } from 'react-native';

import {
  useKnowledgeGraphControllerListEdgesSuspense,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import type { GraphEdge } from '@repo/client/api-client/generated/schemas/graphEdge.zod';
import type { KnowledgeGraphControllerListEdgesParams } from '@repo/client/api-client/generated/schemas/knowledgeGraphControllerListEdgesParams.zod';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
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
import { getGraphRecordActions } from '@core/features/knowledge-graph/lib/graph-permission';
import { formatPredicate } from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { Edit2, Eye, EyeOff, PencilLine, Trash2 } from 'lucide-react-native';

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
  params: KnowledgeGraphControllerListEdgesParams;
}) {
  const page = useKnowledgeGraphControllerListEdgesSuspense(
    organizationId,
    params,
  ).data;
  const selection = useGraphStudioStore((state) => state.selection);
  const scope = `${params.relation ?? ''}:${params.limit ?? 50}`;
  const [navigation, setNavigation] = useState<{
    scope: string;
    previous: Array<string | null>;
  }>({ scope, previous: [] });
  if (navigation.scope !== scope) {
    setNavigation({ scope, previous: [] });
  }
  const pageSize = params.limit ?? 50;
  const start = navigation.previous.length * pageSize;

  return (
    <View className="gap-4">
      <GraphTable columns={GRAPH_EDGE_TABLE_COLUMNS}>
        {page.items.length === 0 ? (
          <GraphTableEmpty message="검색 조건에 일치하는 관계가 없습니다." />
        ) : (
          page.items.map((edge) => (
            <Suspense fallback={<GraphEdgeRowSkeleton />} key={edge.id}>
              <GraphEdgeRow
                edge={edge}
                organizationId={organizationId}
                selected={
                  selection?.kind === 'edge' && selection.id === edge.id
                }
              />
            </Suspense>
          ))
        )}
      </GraphTable>

      <GraphPagination
        canPrevious={navigation.previous.length > 0}
        label={
          page.totalCount === null
            ? `전체 수 미확정 · 현재 ${page.items.length}개 관계`
            : `전체 ${page.totalCount}개 관계 중 ${page.totalCount > 0 ? start + 1 : 0}–${Math.min(start + pageSize, page.totalCount)}`
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

function GraphEdgeRowSkeleton() {
  return (
    <GraphTableRow selected={false}>
      {GRAPH_EDGE_TABLE_COLUMNS.map((column) => (
        <GraphTableCell
          align={column.align}
          className={column.className}
          key={column.key}
        >
          <Skeleton className="h-3.5 w-3/4" />
        </GraphTableCell>
      ))}
    </GraphTableRow>
  );
}

function GraphEdgeRow({
  edge,
  organizationId,
  selected,
}: {
  edge: GraphEdge;
  organizationId: string;
  selected: boolean;
}) {
  const sourceNode = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.sourceNodeId,
  ).data;
  const targetNode = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.targetNodeId,
  ).data;
  const select = useGraphStudioStore((state) => state.select);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const actions = getGraphRecordActions(edge);
  const predicate = edge.predicate ?? edge.relation;
  const label = `${sourceNode.title} ${formatPredicate(predicate)} ${targetNode.title}`;

  return (
    <GraphTableRow selected={selected}>
      <GraphTableCell className="min-w-[180px] flex-1">
        <GraphTableTitleButton
          accessibilityLabel={`${label} 관계 상세 보기`}
          label={sourceNode.title}
          mono
          onPress={() => select({ kind: 'edge', id: edge.id })}
        />
      </GraphTableCell>
      <GraphTableCell className="w-44">
        <GraphMetaBadge
          label={`${formatPredicate(predicate)}${edge.directed ? '' : ' ↔'}`}
          mono
        />
      </GraphTableCell>
      <GraphTableCell className="min-w-[180px] flex-1">
        <Text className="font-mono text-xs" numberOfLines={1}>
          {targetNode.title}
        </Text>
      </GraphTableCell>
      <GraphTableCell className="w-44 flex-wrap">
        <GraphFactClassBadge factClass={edge.factClass} />
        <GraphProjectionBadge projection={edge.projectionState} />
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
            onPress={() => openDialog({ type: 'edge-edit', edgeId: edge.id })}
          />
        ) : null}
        {actions.has('correct') ? (
          <GraphRowActionButton
            icon={PencilLine}
            label={`${label} 추출 결과 정정`}
            onPress={() =>
              openDialog({ type: 'edge-correct', edgeId: edge.id })
            }
          />
        ) : null}
        {actions.has('delete') || actions.has('suppress') ? (
          <GraphRowActionButton
            destructive
            icon={actions.has('suppress') ? EyeOff : Trash2}
            label={`${label} ${actions.has('suppress') ? '숨김' : '삭제'}`}
            onPress={() => openDialog({ type: 'edge-delete', edgeId: edge.id })}
          />
        ) : null}
      </GraphTableCell>
    </GraphTableRow>
  );
}
