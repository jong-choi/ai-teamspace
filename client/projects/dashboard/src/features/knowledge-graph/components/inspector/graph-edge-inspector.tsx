import { Pressable, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  GraphFactClassBadge,
  GraphMetaBadge,
  GraphProjectionBadge,
} from '@core/features/knowledge-graph/components/graph-badges';
import { GraphInspectorActions } from '@core/features/knowledge-graph/components/inspector/graph-inspector-actions';
import {
  formatGraphDate,
  GraphInspectorField,
  GraphInspectorFields,
  GraphInspectorFrame,
  GraphInspectorSectionTitle,
  GraphInspectorTitle,
} from '@core/features/knowledge-graph/components/inspector/graph-inspector-frame';
import type { GraphFixtureNodeOption } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 edge 상세의 generated Suspense hook으로 직접 교체한다.
import { useGraphFixtureEdgeSuspense } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import { getGraphRecordActions } from '@core/features/knowledge-graph/lib/graph-permission';
import {
  formatPredicate,
  GRAPH_NODE_KIND_META,
  GRAPH_PREDICATE_LABELS,
} from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { ArrowDown, ArrowUpDown } from 'lucide-react-native';

export function GraphEdgeInspector({
  edgeId,
  headerClassName,
  organizationId,
}: {
  edgeId: string;
  headerClassName?: string;
  organizationId: string;
}) {
  const edge = useGraphFixtureEdgeSuspense(organizationId, edgeId).data;
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const actions = getGraphRecordActions(edge);
  const predicateLabel = GRAPH_PREDICATE_LABELS[edge.predicate];

  return (
    <GraphInspectorFrame
      badge="Edge"
      footer={
        <GraphInspectorActions
          actions={actions}
          editLabel="관계 편집"
          onDelete={() => openDialog({ type: 'edge-delete', edgeId: edge.id })}
          onEdit={() => openDialog({ type: 'edge-edit', edgeId: edge.id })}
          readOnlyMessage="확정 관계는 각 업무 화면의 원본에서 바뀝니다."
        />
      }
      headerClassName={headerClassName}
    >
      <GraphInspectorTitle
        id={edge.id}
        title={
          predicateLabel
            ? `${formatPredicate(edge.predicate)} · ${predicateLabel}`
            : formatPredicate(edge.predicate)
        }
      />

      <View className="gap-2.5">
        <GraphInspectorSectionTitle title="연결 방향" />
        <View className="gap-1.5">
          <GraphEdgeEndpoint
            label="출발 노드 (Source)"
            node={edge.sourceNode}
          />
          <View className="items-center">
            <Icon
              as={edge.directed ? ArrowDown : ArrowUpDown}
              className="size-3.5 text-muted-foreground"
            />
          </View>
          <GraphEdgeEndpoint
            label="도착 노드 (Target)"
            node={edge.targetNode}
          />
        </View>
      </View>

      <GraphInspectorFields>
        <GraphInspectorField label="방향">
          {edge.directed ? '방향 있음' : '방향 없음'}
        </GraphInspectorField>
        <GraphInspectorField label="출처">
          <GraphFactClassBadge factClass={edge.factClass} />
          <GraphProjectionBadge projection={edge.projection} />
        </GraphInspectorField>
        <GraphInspectorField label="리비전">{`r${edge.revision}`}</GraphInspectorField>
        <GraphInspectorField label="수정">
          {formatGraphDate(edge.updatedAt)}
        </GraphInspectorField>
      </GraphInspectorFields>

      {edge.evidence ? (
        <View className="gap-1.5">
          <GraphInspectorSectionTitle title="추출 근거" />
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={4}
          >
            {edge.evidence}
          </Text>
        </View>
      ) : null}
    </GraphInspectorFrame>
  );
}

function GraphEdgeEndpoint({
  label,
  node,
}: {
  label: string;
  node: GraphFixtureNodeOption;
}) {
  const select = useGraphStudioStore((state) => state.select);
  return (
    <Pressable
      accessibilityLabel={`${label} ${node.title} 선택`}
      accessibilityRole="button"
      className="gap-1 rounded-lg border border-border bg-background p-2.5 web:hover:bg-muted/40"
      onPress={() => select({ kind: 'node', id: node.id })}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-mono text-[10px] font-semibold text-muted-foreground">
          {label}
        </Text>
        <GraphMetaBadge label={GRAPH_NODE_KIND_META[node.kind].code} />
      </View>
      <Text className="text-xs font-medium" numberOfLines={1}>
        {node.title}
      </Text>
    </Pressable>
  );
}
