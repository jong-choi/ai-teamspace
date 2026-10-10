import { useState } from 'react';
import { View } from 'react-native';

import {
  getKnowledgeGraphControllerExploreQueryKey,
  getKnowledgeGraphControllerListNodesQueryKey,
  getKnowledgeGraphControllerNodeDetailQueryKey,
  useKnowledgeGraphCommandControllerCreateCorrection,
  useKnowledgeGraphCommandControllerCreateCuratedNode,
  useKnowledgeGraphCommandControllerUpdateCuratedNode,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import {
  CreateCuratedNodeCommand,
  type CreateCuratedNodeCommand as CreateCuratedNodeCommandValue,
  createCuratedNodeCommandTitleMax,
} from '@repo/client/api-client/generated/schemas/createCuratedNodeCommand.zod';
import { CreateSemanticCorrectionCommand } from '@repo/client/api-client/generated/schemas/createSemanticCorrectionCommand.zod';
import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  GraphDialogFooter,
  GraphDialogFrame,
  GraphDialogSkeleton,
  GraphFormField,
} from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import { useKnowledgeGraphMutationError } from '@core/features/knowledge-graph/hooks/use-knowledge-graph-mutation-error';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { useQueryClient } from '@tanstack/react-query';
import { Box, PencilLine } from 'lucide-react-native';

const CURATED_NODE_KINDS = CreateCuratedNodeCommand.shape.kind.options;
const TITLE_MAX_LENGTH = createCuratedNodeCommandTitleMax;

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
  const node = useKnowledgeGraphControllerNodeDetailSuspense(
    organizationId,
    nodeId,
  ).data;
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
  node?: GraphNode;
  organizationId: string;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useKnowledgeGraphMutationError({
    fallback: '노드를 저장하지 못했습니다.',
    id: 'knowledge-graph-node',
    title: '노드 저장 실패',
  });
  const create = useKnowledgeGraphCommandControllerCreateCuratedNode({
    mutation: { onError: notifyError },
  });
  const update = useKnowledgeGraphCommandControllerUpdateCuratedNode({
    mutation: { onError: notifyError },
  });
  const correct = useKnowledgeGraphCommandControllerCreateCorrection({
    mutation: { onError: notifyError },
  });
  const [titleValue, setTitleValue] = useState(node?.title ?? '');
  const [kind, setKind] = useState<CreateCuratedNodeCommandValue['kind']>(
    node?.curated?.kind ?? 'concept',
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || correct.isPending;

  const invalidate = (detailNodeId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerExploreQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerListNodesQueryKey(organizationId),
      }),
      ...(detailNodeId
        ? [
            queryClient.invalidateQueries({
              queryKey: getKnowledgeGraphControllerNodeDetailQueryKey(
                organizationId,
                detailNodeId,
              ),
            }),
          ]
        : []),
    ]);

  const saved = (title: string, detailNodeId?: string) => {
    notifySuccess({
      title,
      description:
        'PostgreSQL에 저장했습니다. 그래프 반영은 잠시 후 완료됩니다.',
    });
    closeDialog();
    return invalidate(detailNodeId);
  };

  const submit = () => {
    const trimmed = titleValue.trim();
    if (!trimmed || [...trimmed].length > TITLE_MAX_LENGTH) {
      setTitleError(`표시 라벨은 1~${TITLE_MAX_LENGTH}자로 입력해 주세요.`);
      return;
    }
    setTitleError(null);
    if (mode === 'create') {
      const parsed = CreateCuratedNodeCommand.safeParse({
        kind,
        title: trimmed,
        properties: {},
      });
      if (!parsed.success) {
        setTitleError('입력값을 다시 확인해 주세요.');
        return;
      }
      create.mutate(
        { organizationId, data: parsed.data },
        {
          onSuccess: () => saved('노드를 만들었습니다'),
        },
      );
      return;
    }
    if (!node) return;
    if (mode === 'edit') {
      if (node.editTarget.kind !== 'curated_node') return;
      update.mutate(
        {
          organizationId,
          nodeId: node.editTarget.nodeId,
          data: {
            kind,
            title: trimmed,
            properties: node.curated?.properties ?? {},
            expectedRevision: node.editTarget.revision,
          },
        },
        { onSuccess: () => saved('노드를 수정했습니다', node.id) },
      );
      return;
    }
    const correction = CreateSemanticCorrectionCommand.safeParse({
      action: 'label_override',
      nodeId: node.id,
      value: { label: trimmed },
    });
    if (!correction.success) {
      setTitleError('정정할 라벨을 다시 확인해 주세요.');
      return;
    }
    correct.mutate(
      { organizationId, data: correction.data },
      { onSuccess: () => saved('추출 결과를 정정했습니다', node.id) },
    );
  };

  return (
    <>
      <View className="gap-4">
        <GraphFormField label="노드 고유 ID">
          <Input
            accessibilityLabel="노드 고유 ID"
            className="h-9 font-mono text-xs md:text-xs"
            editable={false}
            placeholder="저장하면 자동으로 만들어집니다"
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

        {mode === 'correct' ? null : (
          <GraphFormField label="카테고리 / 엔티티 유형">
            <Select
              disabled={busy}
              onValueChange={(option) => {
                const next = CURATED_NODE_KINDS.find(
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
                {CURATED_NODE_KINDS.map((candidate) => (
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
        )}
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

function kindLabel(kind: CreateCuratedNodeCommandValue['kind']) {
  const labels: Record<CreateCuratedNodeCommandValue['kind'], string> = {
    custom: 'Custom (사용자 정의)',
    concept: 'Concept (개념)',
    topic: 'Topic (주제)',
    technology: 'Technology (기술)',
    reference: 'Reference (참고 자료)',
  };
  return labels[kind];
}
