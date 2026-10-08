import { useState } from 'react';
import { View } from 'react-native';

import { Input } from '@repo/client/rnr/components/ui/input';
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
  GRAPH_FIXTURE_CURATED_NODE_KINDS,
  GRAPH_FIXTURE_NODE_KINDS,
  type GraphFixtureCuratedNodeKind,
  type GraphFixtureNodeDetail,
  type GraphFixtureNodeKind,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 curated/correction generated mutation hook으로 직접 교체한다.
import { useGraphFixtureNodeMutations } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-mutations';
// TODO(graph-05-orval): graph-05 node 상세 generated Suspense hook으로 직접 교체한다.
import { useGraphFixtureNodeSuspense } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import { GRAPH_NODE_KIND_META } from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { Box, PencilLine } from 'lucide-react-native';

// TODO(graph-05-orval): 서버 CreateCuratedNode의 trim·min(1)·max(200)과 같다. generated Zod schema의 safeParse로 직접 교체한다.
const TITLE_MAX_LENGTH = 200;

type NodeDialogMode = 'create' | 'edit' | 'correct';

export function GraphNodeDialog({
  mode,
  nodeId,
  organizationId,
}: {
  mode: NodeDialogMode;
  nodeId?: string;
  organizationId: string;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const title =
    mode === 'create'
      ? '엔티티 노드 추가'
      : mode === 'edit'
        ? '엔티티 노드 수정'
        : 'AI 추출 결과 정정';

  if (mode === 'create' || !nodeId) {
    return (
      <GraphDialogFrame icon={Box} onOpenChange={closeDialog} title={title}>
        <GraphNodeForm mode="create" organizationId={organizationId} />
      </GraphDialogFrame>
    );
  }

  return (
    <GraphDialogFrame
      description={
        mode === 'correct'
          ? '다음 재색인에도 정정한 값이 유지됩니다.'
          : undefined
      }
      icon={mode === 'correct' ? PencilLine : Box}
      onOpenChange={closeDialog}
      title={title}
    >
      <DashboardQueryBoundary
        errorFallbackClassName="py-6"
        fallback={<GraphDialogSkeleton />}
        title="노드를 불러오지 못했습니다"
      >
        <GraphLoadedNodeForm
          mode={mode}
          nodeId={nodeId}
          organizationId={organizationId}
        />
      </DashboardQueryBoundary>
    </GraphDialogFrame>
  );
}

function GraphLoadedNodeForm({
  mode,
  nodeId,
  organizationId,
}: {
  mode: 'edit' | 'correct';
  nodeId: string;
  organizationId: string;
}) {
  const node = useGraphFixtureNodeSuspense(organizationId, nodeId).data;
  return (
    <GraphNodeForm mode={mode} node={node} organizationId={organizationId} />
  );
}

function GraphNodeForm({
  mode,
  node,
  organizationId,
}: {
  mode: NodeDialogMode;
  node?: GraphFixtureNodeDetail;
  organizationId: string;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const select = useGraphStudioStore((state) => state.select);
  const mutations = useGraphFixtureNodeMutations(organizationId);
  const [titleValue, setTitleValue] = useState(node?.title ?? '');
  const [kind, setKind] = useState<GraphFixtureNodeKind>(
    node?.kind ?? 'concept',
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const kindOptions: readonly GraphFixtureNodeKind[] =
    mode === 'correct'
      ? GRAPH_FIXTURE_NODE_KINDS
      : GRAPH_FIXTURE_CURATED_NODE_KINDS;
  const busy =
    mutations.create.isPending ||
    mutations.update.isPending ||
    mutations.correct.isPending;

  const submit = () => {
    const trimmed = titleValue.trim();
    if (!trimmed || [...trimmed].length > TITLE_MAX_LENGTH) {
      setTitleError(`표시 라벨은 1~${TITLE_MAX_LENGTH}자로 입력해 주세요.`);
      return;
    }
    setTitleError(null);
    const curatedKind = GRAPH_FIXTURE_CURATED_NODE_KINDS.find(
      (candidate) => candidate === kind,
    );

    if (mode === 'create') {
      if (!curatedKind) return;
      mutations.create.mutate(
        { kind: curatedKind, title: trimmed },
        {
          onSuccess: ({ id }) => {
            closeDialog();
            select({ kind: 'node', id });
          },
        },
      );
      return;
    }
    if (!node) return;
    if (mode === 'edit') {
      if (!curatedKind) return;
      mutations.update.mutate(
        {
          nodeId: node.id,
          input: { kind: curatedKind, title: trimmed, revision: node.revision },
        },
        { onSuccess: closeDialog },
      );
      return;
    }
    mutations.correct.mutate(
      {
        nodeId: node.id,
        input: { kind, title: trimmed, revision: node.revision },
      },
      { onSuccess: closeDialog },
    );
  };

  return (
    <>
      <View className="gap-4">
        <GraphFormField
          hint={node ? '고유 ID는 서버가 만들며 바꿀 수 없습니다.' : undefined}
          label="노드 고유 ID"
        >
          <Input
            accessibilityLabel="노드 고유 ID"
            className="h-9 font-mono text-xs md:text-xs"
            editable={false}
            placeholder="저장하면 서버가 만듭니다"
            value={node?.id ?? ''}
          />
        </GraphFormField>

        <GraphFormField error={titleError} label="표시 라벨 (Name/Title)">
          <Input
            accessibilityLabel="표시 라벨"
            autoFocus
            className="h-9 text-xs md:text-xs"
            editable={!busy}
            maxLength={TITLE_MAX_LENGTH}
            onChangeText={setTitleValue}
            onSubmitEditing={submit}
            placeholder="예: Work OS Architecture"
            value={titleValue}
          />
        </GraphFormField>

        <GraphFormField label="카테고리 / 엔티티 유형">
          <Select
            disabled={busy}
            onValueChange={(option) => {
              const next = kindOptions.find(
                (candidate) => candidate === option?.value,
              );
              if (next) setKind(next);
            }}
            value={{ value: kind, label: kindLabel(kind) }}
          >
            <SelectTrigger
              accessibilityLabel="엔티티 유형 선택"
              className="h-9 w-full"
            >
              <SelectValue className="text-xs" placeholder="유형 선택" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              {kindOptions.map((candidate) => (
                <SelectItem
                  key={candidate}
                  label={kindLabel(candidate)}
                  value={candidate}
                >
                  {kindLabel(candidate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GraphFormField>
      </View>

      <GraphDialogFooter
        busy={busy}
        confirmLabel={mode === 'correct' ? '정정 저장' : '저장하기'}
        onCancel={closeDialog}
        onConfirm={submit}
      />
    </>
  );
}

function kindLabel(kind: GraphFixtureNodeKind | GraphFixtureCuratedNodeKind) {
  const meta = GRAPH_NODE_KIND_META[kind];
  return `${meta.code} (${meta.label})`;
}
