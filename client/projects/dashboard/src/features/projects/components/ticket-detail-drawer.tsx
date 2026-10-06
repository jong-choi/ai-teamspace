import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  OrganizationMember,
  ProjectColumn,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { TicketChecklistSection } from '@core/features/projects/components/ticket-checklist-section';
import { TicketCommentsSection } from '@core/features/projects/components/ticket-comments-section';
import { TicketMarkdownEditor } from '@core/features/projects/components/ticket-markdown-editor';
import { TicketMetadataPanel } from '@core/features/projects/components/ticket-metadata-panel';
import {
  useProjectLabels,
  useProjectTicketDetail,
} from '@core/features/projects/projects-query';
import { useTicketDetailMutations } from '@core/features/projects/ticket-detail-mutations';

import { X } from 'lucide-react-native';

export function TicketDetailDrawer({
  columns,
  members,
  onOpenChange,
  open,
  organizationId,
  projectId,
  projectName,
  ticketId,
}: {
  columns: readonly ProjectColumn[];
  members: readonly OrganizationMember[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  projectId: string;
  projectName: string;
  ticketId: string | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-full max-h-full w-full max-w-none gap-0 rounded-none border-0 p-0 sm:ml-auto sm:mr-0 sm:max-w-2xl sm:border-l"
        overlayClassName="bg-zinc-950/60 p-0 web:backdrop-blur-sm"
        showCloseButton={false}
      >
        {ticketId ? (
          <DashboardQueryBoundary
            fallback={<TicketDetailLoading />}
            resetKeys={[ticketId]}
            title="이슈 상세를 불러오지 못했습니다"
          >
            <TicketDetailContent
              columns={columns}
              members={members}
              organizationId={organizationId}
              projectId={projectId}
              projectName={projectName}
              ticketId={ticketId}
            />
          </DashboardQueryBoundary>
        ) : (
          <TicketDetailLoading />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailLoading() {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-6">
      <ActivityIndicator size="small" />
      <Text className="text-xs text-muted-foreground">
        이슈 상세를 불러오는 중...
      </Text>
    </View>
  );
}

function TicketDetailContent({
  columns,
  members,
  organizationId,
  projectId,
  projectName,
  ticketId,
}: {
  columns: readonly ProjectColumn[];
  members: readonly OrganizationMember[];
  organizationId: string;
  projectId: string;
  projectName: string;
  ticketId: string;
}) {
  const { currentUserId } = useDashboardPlatform();
  const insets = useSafeAreaInsets();
  const detail = useProjectTicketDetail(
    organizationId,
    projectId,
    ticketId,
  ).data;
  const labels = useProjectLabels(organizationId, projectId).data.items;
  const mutations = useTicketDetailMutations({
    organizationId,
    projectId,
    ticketId,
  });
  const [titleDraft, setTitleDraft] = useState(detail.title);
  const [descriptionDraft, setDescriptionDraft] = useState(
    detail.descriptionMarkdown,
  );
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const archived = detail.archivedAt !== null;
  const ticketDisabled = archived || mutations.ticketPending;
  const checklistDisabled = archived || mutations.checklistPending;
  const commentDisabled = archived || mutations.commentPending;
  const labelDisabled = archived || mutations.labelPending;

  useEffect(() => setTitleDraft(detail.title), [detail.title]);
  useEffect(() => {
    if (!descriptionEditing) setDescriptionDraft(detail.descriptionMarkdown);
  }, [descriptionEditing, detail.descriptionMarkdown]);

  return (
    <View className="min-h-0 flex-1">
      <View
        className="shrink-0 border-b border-border bg-muted/30 px-6 pb-4 pt-4"
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
            <View className="rounded bg-muted px-2 py-0.5">
              <Text className="font-mono text-xs font-bold">{detail.key}</Text>
            </View>
            <Text className="text-xs text-muted-foreground">/</Text>
            <Text className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              {projectName}
            </Text>
          </View>
          <DialogClose
            accessibilityLabel="이슈 상세 닫기"
            className="rounded-md p-1 active:bg-muted web:hover:bg-muted"
            hitSlop={12}
          >
            <Icon as={X} className="size-4 text-muted-foreground" />
          </DialogClose>
        </View>
        <DialogTitle className="sr-only">{detail.key} 이슈 상세</DialogTitle>
        <DialogDescription className="sr-only">
          이슈 설명, 체크리스트, 댓글과 metadata를 편집합니다.
        </DialogDescription>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="min-h-0 flex-1"
      >
        <ScrollView
          className="min-h-0 flex-1"
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 24 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-6 md:flex-row md:items-start">
            <View className="min-w-0 flex-1 gap-5">
              <Input
                accessibilityLabel="이슈 제목"
                className="h-10 rounded-none border-0 border-b border-transparent bg-transparent px-0 py-1 text-base font-bold shadow-none web:hover:border-border web:focus-visible:border-muted-foreground web:focus-visible:ring-0"
                editable={!ticketDisabled}
                onBlur={() => {
                  const title = titleDraft.trim();
                  if (!title) {
                    setTitleDraft(detail.title);
                    return;
                  }
                  if (title !== detail.title) {
                    mutations.updateTicket(
                      { title },
                      { onError: () => setTitleDraft(detail.title) },
                    );
                  }
                }}
                onChangeText={setTitleDraft}
                value={titleDraft}
              />

              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-xs font-semibold text-muted-foreground">
                    상세 설명 (Markdown)
                  </Text>
                  <Button
                    disabled={ticketDisabled}
                    onPress={() => {
                      if (descriptionEditing) {
                        setDescriptionDraft(detail.descriptionMarkdown);
                      }
                      setDescriptionEditing((current) => !current);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    <Text className="text-[11px]">
                      {descriptionEditing ? '취소' : '편집'}
                    </Text>
                  </Button>
                </View>

                <TicketMarkdownEditor
                  editable={descriptionEditing && !ticketDisabled}
                  onChangeText={setDescriptionDraft}
                  placeholder="Markdown으로 상세 설명을 작성하세요..."
                  value={
                    descriptionEditing
                      ? descriptionDraft
                      : detail.descriptionMarkdown
                  }
                />

                {descriptionEditing ? (
                  <View className="flex-row justify-end">
                    <Button
                      disabled={ticketDisabled}
                      onPress={() => {
                        mutations.updateTicket(
                          { descriptionMarkdown: descriptionDraft },
                          { onSuccess: () => setDescriptionEditing(false) },
                        );
                      }}
                      size="sm"
                    >
                      <Text className="text-xs text-primary-foreground">
                        설명 저장
                      </Text>
                    </Button>
                  </View>
                ) : null}
              </View>

              <TicketChecklistSection
                checklists={detail.checklists}
                disabled={checklistDisabled}
                onAddItem={mutations.addChecklistItem}
                onCreateChecklist={mutations.createChecklist}
                onMoveItem={mutations.moveChecklistItem}
                onRemoveChecklist={mutations.removeChecklist}
                onRemoveItem={mutations.removeChecklistItem}
                onUpdateChecklist={mutations.updateChecklist}
                onUpdateItem={mutations.updateChecklistItem}
              />

              <TicketCommentsSection
                comments={detail.comments}
                currentUserId={currentUserId ?? null}
                disabled={commentDisabled}
                onCreateComment={mutations.createComment}
                onRemoveComment={mutations.removeComment}
                onUpdateComment={mutations.updateComment}
              />
            </View>

            <TicketMetadataPanel
              allLabels={labels}
              columns={columns}
              detail={detail}
              fieldDisabled={ticketDisabled}
              labelDisabled={labelDisabled}
              members={members}
              onAttachLabel={mutations.attachLabel}
              onDetachLabel={mutations.detachLabel}
              onMoveTicket={mutations.moveTicket}
              onUpdateTicket={mutations.updateTicket}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
