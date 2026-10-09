import { View } from 'react-native';

import {
  getKnowledgeGraphControllerExploreQueryKey,
  getKnowledgeGraphControllerListEdgesQueryKey,
  getKnowledgeGraphControllerListNodesQueryKey,
  useKnowledgeGraphCommandControllerCreateCorrection,
  useKnowledgeGraphCommandControllerDeleteCuratedEdge,
  useKnowledgeGraphCommandControllerDeleteCuratedNode,
  useKnowledgeGraphControllerEdgeDetailSuspense,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  GraphDialogFooter,
  GraphDialogFrame,
  GraphDialogSkeleton,
} from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import { GraphMetaBadge } from '@core/features/knowledge-graph/components/graph-badges';
import { useKnowledgeGraphMutationError } from '@core/features/knowledge-graph/hooks/use-knowledge-graph-mutation-error';
import {
  formatPredicate,
  GRAPH_NODE_KIND_META,
} from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { useQueryClient } from '@tanstack/react-query';
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
  const node = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    nodeId,
  ).data;
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const forgetNode = useGraphStudioStore((state) => state.forgetNode);
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useKnowledgeGraphMutationError({
    fallback: '노드를 삭제하지 못했습니다.',
    id: 'knowledge-graph-node-delete',
    title: '노드 삭제 실패',
  });
  const remove = useKnowledgeGraphCommandControllerDeleteCuratedNode({
    mutation: { onError: notifyError },
  });
  const suppressMutation = useKnowledgeGraphCommandControllerCreateCorrection({
    mutation: { onError: notifyError },
  });
  const suppress = node.factClass === 'extracted';
  const connectedCount = node.connectedEdgeCount ?? 0;
  const blocked = !suppress && connectedCount > 0;
  const busy = remove.isPending || suppressMutation.isPending;

  const finish = () => {
    notifySuccess({
      title: suppress ? 'AI 추출 노드를 숨겼습니다' : '노드를 삭제했습니다',
      description:
        'PostgreSQL에 저장했습니다. 그래프 반영은 잠시 후 완료됩니다.',
    });
    closeDialog();
    forgetNode(node.id);
    return invalidateGraph(queryClient, organizationId);
  };

  const confirm = () => {
    if (suppress) {
      suppressMutation.mutate(
        { organizationId, data: { action: 'suppress', nodeId: node.id } },
        { onSuccess: finish },
      );
      return;
    }
    if (node.editTarget.kind !== 'curated_node') return;
    remove.mutate(
      {
        organizationId,
        nodeId: node.editTarget.nodeId,
        params: { expectedRevision: node.editTarget.revision },
      },
      { onSuccess: finish },
    );
  };

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
              ? `연결된 관계 ${connectedCount}개가 있어 삭제할 수 없습니다. 관계를 먼저 삭제해 주세요.`
              : '이 노드를 삭제합니다.'}
        </Text>
      </View>
      <GraphDialogFooter
        busy={busy}
        confirmDisabled={blocked}
        confirmLabel={suppress ? '숨기기' : '삭제'}
        destructive
        onCancel={closeDialog}
        onConfirm={confirm}
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
  const edge = useKnowledgeGraphControllerEdgeDetailSuspense(
    organizationId,
    edgeId,
  ).data;
  const source = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.sourceNodeId,
  ).data;
  const target = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.targetNodeId,
  ).data;
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const forgetEdge = useGraphStudioStore((state) => state.forgetEdge);
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useKnowledgeGraphMutationError({
    fallback: '관계를 삭제하지 못했습니다.',
    id: 'knowledge-graph-edge-delete',
    title: '관계 삭제 실패',
  });
  const remove = useKnowledgeGraphCommandControllerDeleteCuratedEdge({
    mutation: { onError: notifyError },
  });
  const suppressMutation = useKnowledgeGraphCommandControllerCreateCorrection({
    mutation: { onError: notifyError },
  });
  const suppress = edge.factClass === 'extracted';
  const busy = remove.isPending || suppressMutation.isPending;

  const finish = () => {
    notifySuccess({
      title: suppress ? 'AI 추출 관계를 숨겼습니다' : '관계를 삭제했습니다',
      description:
        'PostgreSQL에 저장했습니다. 그래프 반영은 잠시 후 완료됩니다.',
    });
    closeDialog();
    forgetEdge(edge.id);
    return invalidateGraph(queryClient, organizationId);
  };

  const confirm = () => {
    if (suppress) {
      suppressMutation.mutate(
        { organizationId, data: { action: 'suppress', edgeId: edge.id } },
        { onSuccess: finish },
      );
      return;
    }
    if (edge.editTarget.kind !== 'curated_edge') return;
    remove.mutate(
      {
        organizationId,
        edgeId: edge.editTarget.edgeId,
        params: { expectedRevision: edge.editTarget.revision },
      },
      { onSuccess: finish },
    );
  };

  return (
    <>
      <View className="gap-3">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="text-xs font-semibold">{source.title}</Text>
          <GraphMetaBadge
            label={formatPredicate(edge.predicate ?? edge.relation)}
            mono
          />
          <Text className="text-xs font-semibold">{target.title}</Text>
        </View>
        <Text className="text-xs leading-5 text-muted-foreground">
          {suppress
            ? '이 AI 추출 관계를 숨깁니다. 다음 재색인에도 숨김이 유지됩니다.'
            : '이 관계를 삭제합니다. 양쪽 노드는 그대로 남습니다.'}
        </Text>
      </View>
      <GraphDialogFooter
        busy={busy}
        confirmLabel={suppress ? '숨기기' : '삭제'}
        destructive
        onCancel={closeDialog}
        onConfirm={confirm}
      />
    </>
  );
}

function invalidateGraph(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: getKnowledgeGraphControllerExploreQueryKey(organizationId),
    }),
    queryClient.invalidateQueries({
      queryKey: getKnowledgeGraphControllerListNodesQueryKey(organizationId),
    }),
    queryClient.invalidateQueries({
      queryKey: getKnowledgeGraphControllerListEdgesQueryKey(organizationId),
    }),
  ]);
}
