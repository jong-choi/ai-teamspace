import { View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  GraphDialogFooter,
  GraphDialogFrame,
  GraphDialogSkeleton,
} from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import { GraphMetaBadge } from '@core/features/knowledge-graph/components/graph-badges';
// TODO(graph-05-orval): graph-05 curated/correction generated mutation hook으로 직접 교체한다.
import {
  useGraphFixtureEdgeMutations,
  useGraphFixtureNodeMutations,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-mutations';
// TODO(graph-05-orval): graph-05 node·edge 상세 generated Suspense hook으로 직접 교체한다.
import {
  useGraphFixtureEdgeSuspense,
  useGraphFixtureNodeSuspense,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import {
  formatPredicate,
  GRAPH_NODE_KIND_META,
} from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { EyeOff, Trash2 } from 'lucide-react-native';

export function GraphNodeDeleteDialog({
  nodeId,
  organizationId,
}: {
  nodeId: string;
  organizationId: string;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  return (
    <GraphDialogFrame
      icon={Trash2}
      onOpenChange={closeDialog}
      title="노드 삭제 확인"
    >
      {/* 삭제 영향은 열 때마다 서버에서 다시 조회한다. */}
      <DashboardQueryBoundary
        errorFallbackClassName="py-6"
        fallback={<GraphDialogSkeleton fields={1} />}
        title="노드를 불러오지 못했습니다"
      >
        <GraphNodeDeleteConfirm
          nodeId={nodeId}
          organizationId={organizationId}
        />
      </DashboardQueryBoundary>
    </GraphDialogFrame>
  );
}

function GraphNodeDeleteConfirm({
  nodeId,
  organizationId,
}: {
  nodeId: string;
  organizationId: string;
}) {
  const node = useGraphFixtureNodeSuspense(organizationId, nodeId).data;
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const forgetNode = useGraphStudioStore((state) => state.forgetNode);
  const { remove } = useGraphFixtureNodeMutations(organizationId);
  const suppress = node.factClass === 'extracted';
  // curated 노드는 연결된 사용자 관계가 있으면 서버가 거부한다. 자동 cascade는 하지 않는다.
  const blocked = !suppress && node.connectedCuratedEdgeCount > 0;

  return (
    <>
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <GraphMetaBadge label={GRAPH_NODE_KIND_META[node.kind].code} />
          <Text
            className="min-w-0 flex-1 text-sm font-semibold"
            numberOfLines={1}
          >
            {node.title}
          </Text>
        </View>
        <Text className="text-xs leading-5 text-muted-foreground">
          {suppress
            ? '이 AI 추출 노드와 추출 관계를 숨깁니다. 다음 재색인에도 숨김이 유지됩니다.'
            : blocked
              ? `연결된 사용자 관계 ${node.connectedCuratedEdgeCount}개가 있어 삭제할 수 없습니다. 관계를 먼저 삭제해 주세요.`
              : `이 노드를 삭제합니다. 연결된 관계 ${node.connectedEdgeCount}개의 표시도 함께 사라집니다.`}
        </Text>
      </View>
      <GraphDialogFooter
        busy={remove.isPending}
        confirmDisabled={blocked}
        confirmLabel={suppress ? '숨기기' : '삭제'}
        destructive
        onCancel={closeDialog}
        onConfirm={() =>
          remove.mutate(
            { nodeId: node.id, revision: node.revision },
            {
              onSuccess: () => {
                closeDialog();
                forgetNode(node.id);
              },
            },
          )
        }
      />
    </>
  );
}

export function GraphEdgeDeleteDialog({
  edgeId,
  organizationId,
}: {
  edgeId: string;
  organizationId: string;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  return (
    <GraphDialogFrame
      icon={EyeOff}
      onOpenChange={closeDialog}
      title="관계 삭제 확인"
    >
      <DashboardQueryBoundary
        errorFallbackClassName="py-6"
        fallback={<GraphDialogSkeleton fields={1} />}
        title="관계를 불러오지 못했습니다"
      >
        <GraphEdgeDeleteConfirm
          edgeId={edgeId}
          organizationId={organizationId}
        />
      </DashboardQueryBoundary>
    </GraphDialogFrame>
  );
}

function GraphEdgeDeleteConfirm({
  edgeId,
  organizationId,
}: {
  edgeId: string;
  organizationId: string;
}) {
  const edge = useGraphFixtureEdgeSuspense(organizationId, edgeId).data;
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const forgetEdge = useGraphStudioStore((state) => state.forgetEdge);
  const { remove } = useGraphFixtureEdgeMutations(organizationId);
  const suppress = edge.factClass === 'extracted';

  return (
    <>
      <View className="gap-3">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="text-xs font-semibold">{edge.sourceNode.title}</Text>
          <GraphMetaBadge label={formatPredicate(edge.predicate)} mono />
          <Text className="text-xs font-semibold">{edge.targetNode.title}</Text>
        </View>
        <Text className="text-xs leading-5 text-muted-foreground">
          {suppress
            ? '이 AI 추출 관계를 숨깁니다. 다음 재색인에도 숨김이 유지됩니다.'
            : '이 관계를 삭제합니다. 양쪽 노드는 그대로 남습니다.'}
        </Text>
      </View>
      <GraphDialogFooter
        busy={remove.isPending}
        confirmLabel={suppress ? '숨기기' : '삭제'}
        destructive
        onCancel={closeDialog}
        onConfirm={() =>
          remove.mutate(
            {
              edgeId: edge.id,
              revision: edge.revision,
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
            },
            {
              onSuccess: () => {
                closeDialog();
                forgetEdge(edge.id);
              },
            },
          )
        }
      />
    </>
  );
}
