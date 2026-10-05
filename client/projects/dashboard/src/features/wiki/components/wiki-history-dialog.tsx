import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { WikiMarkdownContent } from '@core/features/wiki/components/wiki-document-viewer';
import {
  useWikiDocumentHistory,
  useWikiDocumentRevision,
} from '@core/features/wiki/wiki-query';

export type WikiHistoryDialogProps = {
  documentId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
};

export function WikiHistoryDialog({
  documentId,
  onOpenChange,
  open,
  organizationId,
}: WikiHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>문서 기록</DialogTitle>
          <DialogDescription>
            저장된 revision과 당시 Markdown 내용을 확인합니다.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <DashboardQueryBoundary
            fallback={<DashboardLoading label="문서 기록을 불러오는 중..." />}
            resetKeys={[organizationId, documentId]}
            title="문서 기록을 불러오지 못했습니다"
          >
            <WikiHistoryContent
              documentId={documentId}
              organizationId={organizationId}
            />
          </DashboardQueryBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WikiHistoryContent({
  documentId,
  organizationId,
}: {
  documentId: string;
  organizationId: string;
}) {
  const history = useWikiDocumentHistory(organizationId, documentId).data;
  const revisions = useMemo(
    () =>
      [...history.items].sort((left, right) => right.revision - left.revision),
    [history.items],
  );
  const [selectedRevision, setSelectedRevision] = useState<number | null>(
    revisions[0]?.revision ?? null,
  );

  if (selectedRevision === null) {
    return (
      <DashboardState
        description="아직 저장된 revision이 없습니다."
        title="문서 기록이 없습니다"
      />
    );
  }

  return (
    <View className="min-h-0 gap-4 md:flex-row">
      <ScrollView
        className="max-h-52 shrink-0 md:w-52"
        contentContainerClassName="gap-1"
        showsVerticalScrollIndicator={false}
      >
        {revisions.map((revision) => {
          const active = revision.revision === selectedRevision;
          return (
            <Pressable
              accessibilityLabel={`revision ${revision.revision} 보기`}
              className={cn(
                'rounded-md px-3 py-2',
                active ? 'bg-accent' : 'web:hover:bg-accent/60',
              )}
              key={revision.revision}
              onPress={() => setSelectedRevision(revision.revision)}
            >
              <Text className={cn('text-xs', active && 'font-semibold')}>
                revision {revision.revision}
              </Text>
              <Text className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {formatRevisionTime(revision.createdAt)}
              </Text>
              <Text className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {formatRevisionCollaborators(
                  revision.collaboratorUserIds,
                  revision.editorUserId,
                )}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="min-h-0 flex-1 rounded-lg border border-border bg-background">
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="revision을 불러오는 중..." />}
          resetKeys={[organizationId, documentId, selectedRevision]}
          title="revision을 불러오지 못했습니다"
        >
          <WikiHistoryRevision
            documentId={documentId}
            organizationId={organizationId}
            revision={selectedRevision}
          />
        </DashboardQueryBoundary>
      </View>
    </View>
  );
}

function WikiHistoryRevision({
  documentId,
  organizationId,
  revision,
}: {
  documentId: string;
  organizationId: string;
  revision: number;
}) {
  const detail = useWikiDocumentRevision(
    organizationId,
    documentId,
    revision,
  ).data;

  return (
    <ScrollView
      className="max-h-[420px] min-h-0"
      contentContainerClassName="p-5"
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-4 border-b border-border pb-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold">
            revision {detail.revision}
          </Text>
          <Text className="text-[10px] text-muted-foreground">
            {formatRevisionTime(detail.createdAt)}
          </Text>
        </View>
        <Text className="mt-1 text-[10px] text-muted-foreground">
          {formatRevisionCollaborators(
            detail.collaboratorUserIds,
            detail.editorUserId,
          )}
        </Text>
      </View>
      <WikiMarkdownContent contentMarkdown={detail.contentMarkdown} />
    </ScrollView>
  );
}

function formatRevisionCollaborators(
  collaboratorUserIds: readonly string[],
  editorUserId: string,
): string {
  const collaborators =
    collaboratorUserIds.length > 0 ? collaboratorUserIds : [editorUserId];
  return `참여자 ${collaborators.join(', ')}`;
}

function formatRevisionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
