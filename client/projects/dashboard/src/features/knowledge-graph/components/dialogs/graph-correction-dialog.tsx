import { useState } from 'react';
import { View } from 'react-native';

import {
  getKnowledgeGraphCommandControllerListCorrectionsQueryKey,
  getKnowledgeGraphControllerEdgeDetailQueryKey,
  getKnowledgeGraphControllerExploreQueryKey,
  getKnowledgeGraphControllerListEdgesQueryKey,
  getKnowledgeGraphControllerListNodesQueryKey,
  getKnowledgeGraphControllerNodeDetailQueryKey,
  useKnowledgeGraphCommandControllerCreateCorrection,
  useKnowledgeGraphCommandControllerDeleteCorrection,
  useKnowledgeGraphCommandControllerListCorrectionsSuspense,
  useKnowledgeGraphControllerEdgeDetailSuspense,
  useKnowledgeGraphControllerNodeDetailSuspense,
} from '@repo/client/api-client';
import { CreateSemanticCorrectionCommand } from '@repo/client/api-client/generated/schemas/createSemanticCorrectionCommand.zod';
import type { KnowledgeGraphCommandControllerListCorrectionsParams } from '@repo/client/api-client/generated/schemas/knowledgeGraphCommandControllerListCorrectionsParams.zod';
import type { SemanticCorrections } from '@repo/client/api-client/generated/schemas/semanticCorrections.zod';
import { SemanticRelationship } from '@repo/client/api-client/generated/schemas/semanticRelationship.zod';
import { Badge } from '@repo/client/rnr/components/ui/badge';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  GraphDialogFooter,
  GraphDialogFrame,
  GraphDialogSkeleton,
  GraphFormField,
} from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import { useKnowledgeGraphMutationError } from '@core/features/knowledge-graph/hooks/use-knowledge-graph-mutation-error';
import { formatPredicate } from '@core/features/knowledge-graph/lib/graph-presentation';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { useQueryClient } from '@tanstack/react-query';
import { PencilLine, RotateCcw } from 'lucide-react-native';

type CorrectionItem = SemanticCorrections['items'][number];

export function GraphCorrectionDialog({
  edgeId,
  nodeId,
  organizationId,
}: {
  edgeId?: string;
  nodeId?: string;
  organizationId: string;
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  return (
    <GraphDialogFrame
      icon={PencilLine}
      onOpenChange={closeDialog}
      title={nodeId ? 'AI 추출 노드 정정' : 'AI 추출 관계 정정'}
    >
      <DashboardQueryBoundary
        errorFallbackClassName="py-6"
        fallback={<GraphDialogSkeleton fields={2} />}
        title="보정 정보를 불러오지 못했습니다"
      >
        {nodeId ? (
          <LoadedNodeCorrection
            nodeId={nodeId}
            organizationId={organizationId}
          />
        ) : edgeId ? (
          <LoadedEdgeCorrection
            edgeId={edgeId}
            organizationId={organizationId}
          />
        ) : null}
      </DashboardQueryBoundary>
    </GraphDialogFrame>
  );
}

function LoadedNodeCorrection({
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
  return (
    <CorrectionForm
      initialValue={node.title}
      listParams={{ nodeId }}
      organizationId={organizationId}
      target={{ kind: 'node', id: nodeId }}
    />
  );
}

function LoadedEdgeCorrection({
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
  if (!edge.sourceRef) {
    return (
      <Text className="text-xs text-muted-foreground">
        원본 범위를 확인할 수 없어 이 관계의 보정 목록을 열 수 없습니다.
      </Text>
    );
  }
  return (
    <CorrectionForm
      initialValue={
        SemanticRelationship.options.find(
          (value) => value === edge.predicate,
        ) ?? 'RELATED_TO'
      }
      listParams={{ sourceId: edge.sourceRef.id }}
      organizationId={organizationId}
      target={{ kind: 'edge', id: edgeId }}
    />
  );
}

function CorrectionForm({
  initialValue,
  listParams,
  organizationId,
  target,
}: {
  initialValue: string;
  listParams: KnowledgeGraphCommandControllerListCorrectionsParams;
  organizationId: string;
  target: { kind: 'node' | 'edge'; id: string };
}) {
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const corrections = useKnowledgeGraphCommandControllerListCorrectionsSuspense(
    organizationId,
    listParams,
  ).data;
  const notifyError = useKnowledgeGraphMutationError({
    fallback: '보정을 저장하지 못했습니다.',
    id: 'knowledge-graph-correction',
    title: '보정 저장 실패',
  });
  const create = useKnowledgeGraphCommandControllerCreateCorrection({
    mutation: { onError: notifyError },
  });
  const cancel = useKnowledgeGraphCommandControllerDeleteCorrection({
    mutation: { onError: notifyError },
  });
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || cancel.isPending;

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphCommandControllerListCorrectionsQueryKey(
          organizationId,
          listParams,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerExploreQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerListNodesQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: getKnowledgeGraphControllerListEdgesQueryKey(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey:
          target.kind === 'node'
            ? getKnowledgeGraphControllerNodeDetailQueryKey(
                organizationId,
                target.id,
              )
            : getKnowledgeGraphControllerEdgeDetailQueryKey(
                organizationId,
                target.id,
              ),
      }),
    ]);

  const submit = () => {
    const data =
      target.kind === 'node'
        ? {
            action: 'label_override',
            nodeId: target.id,
            value: { label: value.trim() },
          }
        : {
            action: 'correct_predicate',
            edgeId: target.id,
            value: { predicate: value },
          };
    const parsed = CreateSemanticCorrectionCommand.safeParse(data);
    if (!parsed.success) {
      setError('정정 값을 다시 확인해 주세요.');
      return;
    }
    setError(null);
    create.mutate(
      { organizationId, data: parsed.data },
      {
        onSuccess: () => {
          notifySuccess({
            title: '추출 결과를 정정했습니다',
            description: '보정이 저장됐으며 다음 재색인에도 다시 적용됩니다.',
          });
          return invalidate();
        },
      },
    );
  };

  const cancelCorrection = (correctionId: string) =>
    cancel.mutate(
      { organizationId, correctionId },
      {
        onSuccess: () => {
          notifySuccess({ title: '보정을 취소했습니다' });
          return invalidate();
        },
      },
    );

  return (
    <>
      <View className="gap-4">
        <GraphFormField error={error} label="정정 값">
          {target.kind === 'node' ? (
            <Input
              accessibilityLabel="정정할 노드 라벨"
              autoFocus
              className="h-9 text-xs md:text-xs"
              editable={!busy}
              maxLength={200}
              onChangeText={setValue}
              onSubmitEditing={submit}
              value={value}
            />
          ) : (
            <Select
              disabled={busy}
              onValueChange={(option) => {
                const predicate = SemanticRelationship.options.find(
                  (candidate) => candidate === option?.value,
                );
                if (predicate) setValue(predicate);
              }}
              value={{ value, label: formatPredicate(value) }}
            >
              <SelectTrigger
                accessibilityLabel="정정할 관계 종류"
                className="h-9 w-full"
              >
                <SelectValue
                  className="font-mono text-xs"
                  placeholder="관계 종류 선택"
                />
              </SelectTrigger>
              <SelectContent align="start" side="bottom">
                {SemanticRelationship.options.map((predicate) => (
                  <SelectItem
                    key={predicate}
                    label={formatPredicate(predicate)}
                    value={predicate}
                  >
                    {formatPredicate(predicate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </GraphFormField>

        <View className="gap-2 border-t border-border/60 pt-3">
          <Text className="text-xs font-semibold">
            활성 보정 · revision {corrections.editRevision}
          </Text>
          {corrections.items.length === 0 ? (
            <Text className="text-xs text-muted-foreground">
              이 원본에 활성 보정이 없습니다.
            </Text>
          ) : (
            corrections.items.map((item) => (
              <CorrectionRow
                busy={busy}
                item={item}
                key={item.id}
                onCancel={() => cancelCorrection(item.id)}
              />
            ))
          )}
        </View>
      </View>

      <GraphDialogFooter
        busy={busy}
        confirmLabel="정정 저장"
        onCancel={closeDialog}
        onConfirm={submit}
      />
    </>
  );
}

function CorrectionRow({
  busy,
  item,
  onCancel,
}: {
  busy: boolean;
  item: CorrectionItem;
  onCancel: () => void;
}) {
  const review =
    item.lastMatchState === 'ambiguous_review' ||
    item.lastMatchState === 'pending_review';
  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="font-mono text-2xs font-semibold">
            {item.action}
          </Text>
          <Badge variant={review ? 'destructive' : 'outline'}>
            <Text className="text-3xs">
              {review ? '검토 필요' : (item.lastMatchState ?? '매칭 대기')}
            </Text>
          </Badge>
        </View>
        <Text className="text-2xs text-muted-foreground">
          생성 revision {item.createdRevision}
          {item.linkedCorrectionId ? ' · 짝 보정 포함' : ''}
        </Text>
      </View>
      <Button
        accessibilityLabel="이 보정 취소"
        disabled={busy}
        onPress={onCancel}
        size="icon"
        variant="ghost"
      >
        <Icon as={RotateCcw} className="size-3.5 text-muted-foreground" />
      </Button>
    </View>
  );
}
