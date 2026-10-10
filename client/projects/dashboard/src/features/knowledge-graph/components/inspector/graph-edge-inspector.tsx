import { Pressable, View } from 'react-native';

import {
  useKnowledgeGraphControllerEdgeDetailSuspense,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
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
  const edge = useKnowledgeGraphControllerEdgeDetailSuspense(
    organizationId,
    edgeId,
  ).data;
  const sourceNode = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.sourceNodeId,
  ).data;
  const targetNode = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.targetNodeId,
  ).data;
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const actions = getGraphRecordActions(edge);
  const predicate = edge.predicate ?? edge.relation;
  const predicateLabel = GRAPH_PREDICATE_LABELS[predicate];

  return (
    <GraphInspectorFrame
      badge="Edge"
      footer={
        <GraphInspectorActions
          actions={actions}
          editLabel="관계 편집"
          onCorrect={() =>
            openDialog({ type: 'edge-correct', edgeId: edge.id })
          }
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
            ? `${formatPredicate(predicate)} · ${predicateLabel}`
            : formatPredicate(predicate)
        }
      />

      <View className="gap-2.5">
        <GraphInspectorSectionTitle title="연결 방향" />
        <View className="gap-1.5">
          <GraphEdgeEndpoint label="출발 노드 (Source)" node={sourceNode} />
          <View className="items-center">
            <Icon
              as={edge.directed ? ArrowDown : ArrowUpDown}
              className="size-3.5 text-muted-foreground"
            />
          </View>
          <GraphEdgeEndpoint label="도착 노드 (Target)" node={targetNode} />
        </View>
      </View>

      <GraphInspectorFields>
        <GraphInspectorField label="방향">
          {edge.directed ? '방향 있음' : '방향 없음'}
        </GraphInspectorField>
        <GraphInspectorField label="출처">
          <GraphFactClassBadge factClass={edge.factClass} />
          <GraphProjectionBadge projection={edge.projectionState} />
        </GraphInspectorField>
        {edge.editTarget.kind === 'curated_edge' ? (
          <GraphInspectorField label="리비전">{`r${edge.editTarget.revision}`}</GraphInspectorField>
        ) : null}
        <GraphInspectorField label="수정">
          {edge.sourceRef?.updatedAt
            ? formatGraphDate(edge.sourceRef.updatedAt)
            : '확인 불가'}
        </GraphInspectorField>
      </GraphInspectorFields>

      {edge.provenance?.evidenceDigest ? (
        <View className="gap-1.5">
          <GraphInspectorSectionTitle title="추출 근거" />
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={4}
          >
            {edge.provenance.evidenceDigest}
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
  node: Pick<GraphNode, 'id' | 'kind' | 'title'>;
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
        <Text className="font-mono text-2xs font-semibold text-muted-foreground">
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
