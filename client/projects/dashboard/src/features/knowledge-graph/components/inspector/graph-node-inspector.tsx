import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  useKnowledgeGraphControllerExploreSuspense,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
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
} from '@core/features/knowledge-graph/lib/graph-presentation';
import { getNodeConnections } from '@core/features/knowledge-graph/lib/graph-view-model';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { Plus } from 'lucide-react-native';

const DIRECTION_LABEL = {
  outgoing: 'OUTGOING ➔',
  incoming: 'INCOMING ⬅',
  undirected: 'UNDIRECTED ↔',
  self: 'SELF ↺',
};

export function GraphNodeInspector({
  headerClassName,
  nodeId,
  onNavigate,
  organizationId,
}: {
  headerClassName?: string;
  nodeId: string;
  onNavigate?: () => void;
  organizationId: string;
}) {
  const router = useRouter();
  const node = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    nodeId,
  ).data;
  // 1-hop 이웃을 같은 explore 계약으로 받아 방향과 상대 노드 이름을 보여준다.
  const neighborhood = useKnowledgeGraphControllerExploreSuspense(
    organizationId,
    { focusKind: node.kind, focusId: node.id, depth: 1, limit: 100 },
  ).data;
  const pinned = useGraphStudioStore((state) => state.pinnedPositions[node.id]);
  const select = useGraphStudioStore((state) => state.select);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const actions = getGraphRecordActions(node);
  const titles = new Map(
    neighborhood.nodes.map(({ id, title }) => [id, title]),
  );
  const connections = getNodeConnections(node.id, neighborhood.edges);

  return (
    <GraphInspectorFrame
      badge={GRAPH_NODE_KIND_META[node.kind].code}
      footer={
        <GraphInspectorActions
          actions={actions}
          editLabel="노드 편집"
          onCorrect={() =>
            openDialog({ type: 'node-correct', nodeId: node.id })
          }
          onDelete={() => openDialog({ type: 'node-delete', nodeId: node.id })}
          onEdit={() => openDialog({ type: 'node-edit', nodeId: node.id })}
          onOpenSource={() => {
            if (node.editTarget.kind !== 'owner') return;
            onNavigate?.();
            if (node.editTarget.ownerKind === 'wiki_document') {
              router.push({
                pathname: '/wiki/[documentId]',
                params: { documentId: node.editTarget.sourceId },
              });
            }
            if (node.editTarget.ownerKind === 'project') {
              router.push({
                pathname: '/projects/[projectId]',
                params: { projectId: node.editTarget.sourceId },
              });
            }
          }}
          readOnlyMessage="확정 원본은 각 업무 화면에서 수정합니다."
        />
      }
      headerClassName={headerClassName}
    >
      <GraphInspectorTitle id={node.id} title={node.title} />

      <GraphInspectorFields>
        <GraphInspectorField label="유형">
          {GRAPH_NODE_KIND_META[node.kind].label}
        </GraphInspectorField>
        <GraphInspectorField label="출처">
          <GraphFactClassBadge factClass={node.factClass} />
          <GraphProjectionBadge projection={node.projectionState} />
        </GraphInspectorField>
        {node.sourceRef ? (
          <GraphInspectorField label="원본">
            {node.sourceRef.title ??
              `${node.sourceRef.kind}:${node.sourceRef.id}`}
          </GraphInspectorField>
        ) : null}
        {node.provenance?.extractedName ? (
          <GraphInspectorField label="추출명">
            {node.provenance.extractedName}
          </GraphInspectorField>
        ) : null}
        {node.editTarget.kind === 'curated_node' ? (
          <GraphInspectorField label="리비전">{`r${node.editTarget.revision}`}</GraphInspectorField>
        ) : null}
        <GraphInspectorField label="수정">
          {node.sourceRef?.updatedAt
            ? formatGraphDate(node.sourceRef.updatedAt)
            : '확인 불가'}
        </GraphInspectorField>
        <GraphInspectorField label="좌표">
          {pinned ? `x:${pinned.x}, y:${pinned.y}` : '자동 배치'}
        </GraphInspectorField>
      </GraphInspectorFields>

      <View className="gap-2.5 pt-2">
        <GraphInspectorSectionTitle
          action={
            <Pressable
              accessibilityLabel={`${node.title}에서 시작하는 관계 추가`}
              accessibilityRole="button"
              className="flex-row items-center gap-1"
              hitSlop={8}
              onPress={() =>
                openDialog({ type: 'edge-create', sourceNodeId: node.id })
              }
            >
              <Icon as={Plus} className="size-3 text-muted-foreground" />
              <Text className="text-[11px] font-medium text-muted-foreground">
                관계 추가
              </Text>
            </Pressable>
          }
          title={`연결된 관계 (${node.connectedEdgeCount})`}
        />

        <View className="gap-2">
          {connections.length === 0 ? (
            <Text className="text-xs italic text-muted-foreground">
              연결된 관계가 없습니다.
            </Text>
          ) : (
            connections.map(({ direction, edge, otherNodeId }) => (
              <Pressable
                accessibilityLabel={`${formatPredicate(edge.predicate ?? edge.relation)} 관계, ${titles.get(otherNodeId) ?? otherNodeId}`}
                accessibilityRole="button"
                className="gap-1 rounded-lg border border-border bg-background p-2.5 web:hover:bg-muted/40"
                key={edge.id}
                onPress={() => select({ kind: 'edge', id: edge.id })}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className={cn(
                      'font-mono text-[10px] font-semibold',
                      direction === 'outgoing'
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {DIRECTION_LABEL[direction]}
                  </Text>
                  <GraphMetaBadge
                    label={formatPredicate(edge.predicate ?? edge.relation)}
                    mono
                  />
                </View>
                <Text className="text-xs font-medium" numberOfLines={1}>
                  {titles.get(otherNodeId) ?? otherNodeId}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </GraphInspectorFrame>
  );
}
