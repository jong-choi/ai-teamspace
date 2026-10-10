import { useState } from 'react';
import { View } from 'react-native';

import {
  getKnowledgeGraphCommandControllerEndpointOptionsQueryKey,
  getKnowledgeGraphControllerEdgeDetailQueryKey,
  getKnowledgeGraphControllerExploreQueryKey,
  getKnowledgeGraphControllerListEdgesQueryKey,
  getKnowledgeGraphControllerListNodesQueryKey,
  getKnowledgeGraphControllerNodeDetailQueryKey,
  useKnowledgeGraphCommandControllerCreateCuratedEdge,
  useKnowledgeGraphCommandControllerEndpointOptionsSuspense,
  useKnowledgeGraphCommandControllerUpdateCuratedEdge,
  useKnowledgeGraphControllerEdgeDetailSuspense,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import {
  CreateCuratedEdgeCommand,
  type CreateCuratedEdgeCommand as CreateCuratedEdgeCommandValue,
} from '@repo/client/api-client/generated/schemas/createCuratedEdgeCommand.zod';
import type { GraphEdge } from '@repo/client/api-client/generated/schemas/graphEdge.zod';
import { Select, SelectContent } from '@repo/client/rnr/components/ui/select';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  DashboardSelectItem,
  DashboardSelectTrigger,
  DashboardSelectValue,
} from '@core/app/ui/dashboard-select';
import {
  GraphDialogFooter,
  GraphDialogFrame,
  GraphDialogSkeleton,
  GraphFormField,
} from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import {
  CURATED_PREDICATES,
  endpointFromEdge,
  type EndpointOption,
  GraphNodeSelectField,
  mergeEndpoint,
  predicateLabel,
  toEndpoint,
} from '@core/features/knowledge-graph/components/dialogs/graph-edge-form-support';
import { useKnowledgeGraphMutationError } from '@core/features/knowledge-graph/hooks/use-knowledge-graph-mutation-error';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Link2 } from 'lucide-react-native';

const DIRECTED = 'directed';
const UNDIRECTED = 'undirected';

export function GraphEdgeDialog({
  edgeId,
  organizationId,
  sourceNodeId,
}: {
  edgeId?: string;
  organizationId: string;
  sourceNodeId?: string | null;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  return (
    <GraphDialogFrame
      icon={edgeId ? Link2 : ArrowUpRight}
      onOpenChange={closeDialog}
      title={edgeId ? '관계(Edge) 수정' : '새 관계(Edge) 연결'}
    >
      <DashboardQueryBoundary
        errorFallbackClassName="py-6"
        fallback={<GraphDialogSkeleton fields={4} />}
        title="관계 편집 정보를 불러오지 못했습니다"
      >
        {edgeId ? (
          <GraphLoadedEdgeForm
            edgeId={edgeId}
            organizationId={organizationId}
          />
        ) : sourceNodeId ? (
          <GraphPreselectedEdgeForm
            graphNodeId={sourceNodeId}
            organizationId={organizationId}
          />
        ) : (
          <GraphEdgeForm organizationId={organizationId} />
        )}
      </DashboardQueryBoundary>
    </GraphDialogFrame>
  );
}

function GraphLoadedEdgeForm({
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
  const sourceNode = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.sourceNodeId,
  ).data;
  const targetNode = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    edge.targetNodeId,
  ).data;
  return (
    <GraphEdgeForm
      edge={edge}
      organizationId={organizationId}
      sourceEndpoint={toEndpoint(sourceNode)}
      targetEndpoint={toEndpoint(targetNode)}
    />
  );
}

function GraphPreselectedEdgeForm({
  graphNodeId,
  organizationId,
}: {
  graphNodeId: string;
  organizationId: string;
}) {
  const node = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    graphNodeId,
  ).data;
  return (
    <GraphEdgeForm
      organizationId={organizationId}
      sourceEndpoint={toEndpoint(node)}
    />
  );
}

function GraphEdgeForm({
  edge,
  organizationId,
  sourceEndpoint,
  targetEndpoint,
}: {
  edge?: GraphEdge;
  organizationId: string;
  sourceEndpoint?: EndpointOption | null;
  targetEndpoint?: EndpointOption | null;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useKnowledgeGraphMutationError({
    fallback: '관계를 저장하지 못했습니다.',
    id: 'knowledge-graph-edge',
    title: '관계 저장 실패',
  });
  const options = useKnowledgeGraphCommandControllerEndpointOptionsSuspense(
    organizationId,
    { limit: 20 },
  ).data.items;
  const create = useKnowledgeGraphCommandControllerCreateCuratedEdge({
    mutation: { onError: notifyError },
  });
  const update = useKnowledgeGraphCommandControllerUpdateCuratedEdge({
    mutation: { onError: notifyError },
  });
  const initialSource =
    sourceEndpoint ?? endpointFromEdge(edge, 'source', options);
  const initialTarget =
    targetEndpoint ?? endpointFromEdge(edge, 'target', options);
  const [source, setSource] = useState<EndpointOption | null>(initialSource);
  const [target, setTarget] = useState<EndpointOption | null>(initialTarget);
  const [predicate, setPredicate] = useState<
    CreateCuratedEdgeCommandValue['predicate']
  >(
    CURATED_PREDICATES.find((item) => item === edge?.predicate) ?? 'related_to',
  );
  const [directed, setDirected] = useState(edge?.directed ?? true);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const effectiveDirected = predicate === 'related_to' ? directed : true;
  const allowedPredicates = CURATED_PREDICATES.filter(
    (item) =>
      (!source || source.allowedPredicates.includes(item)) &&
      (!target || target.allowedPredicates.includes(item)),
  );

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerExploreQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerListEdgesQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerListNodesQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey:
          getKnowledgeGraphCommandControllerEndpointOptionsQueryKey(
            organizationId,
          ),
      }),
      ...(edge
        ? [
            queryClient.invalidateQueries({
              queryKey: getKnowledgeGraphControllerEdgeDetailQueryKey(
                organizationId,
                edge.id,
              ),
            }),
            queryClient.invalidateQueries({
              queryKey: getKnowledgeGraphControllerNodeDetailQueryKey(
                organizationId,
                edge.sourceNodeId,
              ),
            }),
            queryClient.invalidateQueries({
              queryKey: getKnowledgeGraphControllerNodeDetailQueryKey(
                organizationId,
                edge.targetNodeId,
              ),
            }),
          ]
        : []),
    ]);

  const saved = (title: string) => {
    notifySuccess({
      title,
      description:
        'PostgreSQL에 저장했습니다. 그래프 반영은 잠시 후 완료됩니다.',
    });
    closeDialog();
    return invalidate();
  };

  const submit = () => {
    if (!source || !target) {
      setError('출발 노드와 도착 노드를 모두 선택해 주세요.');
      return;
    }
    const parsed = CreateCuratedEdgeCommand.safeParse({
      sourceNodeId: source.nodeId,
      sourceNodeKind: source.kind,
      targetNodeId: target.nodeId,
      targetNodeKind: target.kind,
      predicate,
      directed: effectiveDirected,
      properties: edge?.curated?.properties ?? {},
    });
    if (!parsed.success) {
      setError('선택한 노드와 관계 정책을 다시 확인해 주세요.');
      return;
    }
    setError(null);
    if (edge) {
      if (edge.editTarget.kind !== 'curated_edge') return;
      update.mutate(
        {
          organizationId,
          edgeId: edge.editTarget.edgeId,
          data: { ...parsed.data, expectedRevision: edge.editTarget.revision },
        },
        { onSuccess: () => saved('관계를 수정했습니다') },
      );
      return;
    }
    create.mutate(
      { organizationId, data: parsed.data },
      { onSuccess: () => saved('관계를 연결했습니다') },
    );
  };

  return (
    <>
      <View className="gap-4">
        <GraphNodeSelectField
          disabled={busy}
          label="출발 노드 (Source)"
          onChange={setSource}
          options={mergeEndpoint(options, sourceEndpoint)}
          value={source}
        />
        <GraphFormField label="관계 서술어 (Predicate Relationship)">
          <Select
            disabled={busy}
            onValueChange={(option) => {
              const next = allowedPredicates.find(
                (item) => item === option?.value,
              );
              if (next) setPredicate(next);
            }}
            value={{ value: predicate, label: predicateLabel(predicate) }}
          >
            <DashboardSelectTrigger
              accessibilityLabel="관계 서술어 선택"
              className="w-full"
            >
              <DashboardSelectValue
                className="font-mono"
                placeholder="서술어 선택"
              />
            </DashboardSelectTrigger>
            <SelectContent align="start" side="bottom">
              {allowedPredicates.map((item) => (
                <DashboardSelectItem
                  key={item}
                  label={predicateLabel(item)}
                  value={item}
                >
                  {predicateLabel(item)}
                </DashboardSelectItem>
              ))}
            </SelectContent>
          </Select>
        </GraphFormField>
        <GraphNodeSelectField
          disabled={busy}
          label="도착 노드 (Target)"
          onChange={setTarget}
          options={mergeEndpoint(options, targetEndpoint)}
          value={target}
        />
        <GraphFormField
          error={error}
          hint={
            predicate === 'related_to'
              ? undefined
              : '이 서술어는 항상 방향이 있습니다.'
          }
          label="방향"
        >
          <Select
            disabled={busy || predicate !== 'related_to'}
            onValueChange={(option) =>
              setDirected(option?.value !== UNDIRECTED)
            }
            value={
              effectiveDirected
                ? { value: DIRECTED, label: '방향 있음 (Source → Target)' }
                : { value: UNDIRECTED, label: '방향 없음 (Source ↔ Target)' }
            }
          >
            <DashboardSelectTrigger
              accessibilityLabel="관계 방향 선택"
              className="w-full"
            >
              <DashboardSelectValue placeholder="방향 선택" />
            </DashboardSelectTrigger>
            <SelectContent align="start" side="bottom">
              <DashboardSelectItem
                label="방향 있음 (Source → Target)"
                value={DIRECTED}
              >
                방향 있음 (Source → Target)
              </DashboardSelectItem>
              <DashboardSelectItem
                label="방향 없음 (Source ↔ Target)"
                value={UNDIRECTED}
              >
                방향 없음 (Source ↔ Target)
              </DashboardSelectItem>
            </SelectContent>
          </Select>
        </GraphFormField>
      </View>
      <GraphDialogFooter
        busy={busy}
        confirmLabel={edge ? '관계 저장' : '관계 추가'}
        onCancel={closeDialog}
        onConfirm={submit}
      />
    </>
  );
}
