import { useState } from 'react';
import { View } from 'react-native';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  GraphDialogFooter,
  GraphDialogFrame,
  GraphDialogSkeleton,
  GraphFormField,
} from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import {
  GRAPH_FIXTURE_CURATED_PREDICATES,
  type GraphFixtureCuratedPredicate,
  type GraphFixtureEdgeDetail,
  type GraphFixtureNodeOption,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 curated edge generated mutation hook으로 직접 교체한다.
import { useGraphFixtureEdgeMutations } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-mutations';
// TODO(graph-05-orval): graph-05 edge 상세·노드 검색 generated Suspense hook으로 직접 교체한다.
import {
  useGraphFixtureEdgeSuspense,
  useGraphFixtureNodeOptionsSuspense,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import {
  formatPredicate,
  GRAPH_FACT_CLASS_META,
  GRAPH_PREDICATE_LABELS,
} from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

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
        ) : (
          <GraphEdgeForm
            organizationId={organizationId}
            sourceNodeId={sourceNodeId ?? null}
          />
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
  const edge = useGraphFixtureEdgeSuspense(organizationId, edgeId).data;
  return (
    <GraphEdgeForm
      edge={edge}
      organizationId={organizationId}
      sourceNodeId={edge.sourceNodeId}
    />
  );
}

function GraphEdgeForm({
  edge,
  organizationId,
  sourceNodeId,
}: {
  edge?: GraphFixtureEdgeDetail;
  organizationId: string;
  sourceNodeId: string | null;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const select = useGraphStudioStore((state) => state.select);
  const options = useGraphFixtureNodeOptionsSuspense(organizationId).data;
  const mutations = useGraphFixtureEdgeMutations(organizationId);
  // 미리 고른 출발 노드는 초기 state로만 받아 rerender·reset에서 잃지 않는다.
  const [source, setSource] = useState<string | null>(sourceNodeId);
  const [target, setTarget] = useState<string | null>(
    edge?.targetNodeId ?? null,
  );
  const [predicate, setPredicate] = useState<GraphFixtureCuratedPredicate>(
    GRAPH_FIXTURE_CURATED_PREDICATES.find(
      (candidate) => candidate === edge?.predicate,
    ) ?? 'related_to',
  );
  const [directed, setDirected] = useState(edge?.directed ?? true);
  const [error, setError] = useState<string | null>(null);
  const busy = mutations.create.isPending || mutations.update.isPending;
  // related_to만 무방향을 허용한다.
  const effectiveDirected = predicate === 'related_to' ? directed : true;

  const submit = () => {
    if (!source || !target) {
      setError('출발 노드와 도착 노드를 모두 선택해 주세요.');
      return;
    }
    setError(null);
    const input = {
      sourceNodeId: source,
      targetNodeId: target,
      predicate,
      directed: effectiveDirected,
    };
    if (edge) {
      mutations.update.mutate(
        {
          edgeId: edge.id,
          input: { ...input, revision: edge.revision },
          previous: {
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
          },
        },
        { onSuccess: closeDialog },
      );
      return;
    }
    mutations.create.mutate(input, {
      onSuccess: ({ id }) => {
        closeDialog();
        select({ kind: 'edge', id });
      },
    });
  };

  return (
    <>
      <View className="gap-4">
        <GraphNodeSelectField
          label="출발 노드 (Source)"
          onChange={setSource}
          options={options}
          value={source}
          disabled={busy}
        />

        <GraphFormField
          hint={
            predicate === 'references'
              ? 'references는 위키·프로젝트·티켓·회의 원본과도 연결할 수 있습니다.'
              : '사용자 노드끼리만 연결할 수 있습니다.'
          }
          label="관계 서술어 (Predicate Relationship)"
        >
          <Select
            disabled={busy}
            onValueChange={(option) => {
              const next = GRAPH_FIXTURE_CURATED_PREDICATES.find(
                (candidate) => candidate === option?.value,
              );
              if (next) setPredicate(next);
            }}
            value={{ value: predicate, label: predicateLabel(predicate) }}
          >
            <SelectTrigger
              accessibilityLabel="관계 서술어 선택"
              className="h-9 w-full"
            >
              <SelectValue
                className="font-mono text-xs"
                placeholder="서술어 선택"
              />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              {GRAPH_FIXTURE_CURATED_PREDICATES.map((candidate) => (
                <SelectItem
                  key={candidate}
                  label={predicateLabel(candidate)}
                  value={candidate}
                >
                  {predicateLabel(candidate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GraphFormField>

        <GraphNodeSelectField
          label="도착 노드 (Target)"
          onChange={setTarget}
          options={options}
          value={target}
          disabled={busy}
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
            <SelectTrigger
              accessibilityLabel="관계 방향 선택"
              className="h-9 w-full"
            >
              <SelectValue className="text-xs" placeholder="방향 선택" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              <SelectItem label="방향 있음 (Source → Target)" value={DIRECTED}>
                방향 있음 (Source → Target)
              </SelectItem>
              <SelectItem
                label="방향 없음 (Source ↔ Target)"
                value={UNDIRECTED}
              >
                방향 없음 (Source ↔ Target)
              </SelectItem>
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

function GraphNodeSelectField({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (nodeId: string) => void;
  options: readonly GraphFixtureNodeOption[];
  value: string | null;
}) {
  const selected = options.find(({ id }) => id === value);
  return (
    <GraphFormField label={label}>
      <Select
        disabled={disabled}
        onValueChange={(option) => {
          if (option?.value) onChange(option.value);
        }}
        value={
          selected
            ? { value: selected.id, label: nodeOptionLabel(selected) }
            : undefined
        }
      >
        <SelectTrigger
          accessibilityLabel={`${label} 선택`}
          className="h-9 w-full"
        >
          <SelectValue className="text-xs" placeholder="노드 선택" />
        </SelectTrigger>
        <SelectContent align="start" className="max-h-72" side="bottom">
          {options.map((option) => (
            <SelectItem
              key={option.id}
              label={nodeOptionLabel(option)}
              value={option.id}
            >
              {nodeOptionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </GraphFormField>
  );
}

function nodeOptionLabel(option: GraphFixtureNodeOption) {
  return `${option.title} · ${GRAPH_FACT_CLASS_META[option.factClass].label}`;
}

function predicateLabel(predicate: GraphFixtureCuratedPredicate) {
  return `${formatPredicate(predicate)} (${GRAPH_PREDICATE_LABELS[predicate]})`;
}
