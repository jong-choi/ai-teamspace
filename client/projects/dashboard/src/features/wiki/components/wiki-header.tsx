import { Pressable, ScrollView, View } from 'react-native';

import type {
  WikiDocumentTreeNode,
  WikiTreeOutput as WikiTree,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import type { WikiCollaborator } from '@core/features/wiki/collaboration/wiki-awareness';
import type {
  WikiCollaborationIndicator,
  WikiEditorMode,
} from '@core/features/wiki/use-wiki-collaboration-session';
import { getWikiDocumentBreadcrumb } from '@core/features/wiki/wiki-tree-model';

import { Download, FolderTree, History } from 'lucide-react-native';

type WikiHeaderProps = {
  activeDocument?: WikiDocumentTreeNode;
  collaborators?: readonly WikiCollaborator[];
  editModeDisabled?: boolean;
  mode?: WikiEditorMode;
  onExport?: () => void;
  onModeChange?: (mode: WikiEditorMode) => void;
  onOpenHistory?: () => void;
  onOpenTree: () => void;
  onOpenWikiRoot: () => void;
  saveIndicator?: WikiCollaborationIndicator;
  tree: WikiTree;
};

const defaultIndicator: WikiCollaborationIndicator = {
  label: '연결 중…',
  tone: 'pending',
};

export function WikiHeader({
  activeDocument,
  collaborators = [],
  editModeDisabled = false,
  mode = 'view',
  onExport,
  onModeChange,
  onOpenHistory,
  onOpenTree,
  onOpenWikiRoot,
  saveIndicator = defaultIndicator,
  tree,
}: WikiHeaderProps) {
  const breadcrumb = activeDocument
    ? getWikiDocumentBreadcrumb(tree, activeDocument)
    : [{ id: 'wiki' as const, kind: 'root' as const, label: '위키' as const }];
  const actionsEnabled = Boolean(activeDocument);

  return (
    <View className="h-12 shrink-0 flex-row items-center justify-between gap-2 border-b border-border bg-background/95 px-3 md:px-6">
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
        <Button
          accessibilityLabel="위키 탐색기 열기"
          className="mr-1 h-8 w-8 md:hidden"
          onPress={onOpenTree}
          size="icon"
          variant="ghost"
        >
          <Icon as={FolderTree} className="size-4 text-muted-foreground" />
        </Button>
        <ScrollView
          contentContainerClassName="items-center gap-1.5"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {breadcrumb.map((segment, index) => {
            const current = index === breadcrumb.length - 1;
            return (
              <View
                className="flex-row items-center gap-1.5"
                key={`${segment.kind}-${segment.id}`}
              >
                {index > 0 ? (
                  <Text className="text-xs text-border">/</Text>
                ) : null}
                {segment.kind === 'root' ? (
                  <Pressable onPress={onOpenWikiRoot}>
                    <Text
                      className={cn(
                        'text-xs text-muted-foreground',
                        current && 'font-semibold text-foreground',
                      )}
                    >
                      {segment.label}
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    className={cn(
                      'text-xs text-muted-foreground',
                      current && 'font-semibold text-foreground',
                    )}
                  >
                    {segment.label}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View className="shrink-0 flex-row items-center gap-2 md:gap-3">
        <WikiCollaboratorFacepile collaborators={collaborators} />
        <View
          accessibilityLabel={`동기화 상태: ${saveIndicator.label}`}
          accessible
          className="flex-row items-center gap-1.5"
        >
          <View
            className={cn(
              'size-1.5 rounded-full',
              indicatorDotClass(saveIndicator.tone),
            )}
          />
          <Text className="hidden text-[11px] text-muted-foreground sm:flex">
            {saveIndicator.label}
          </Text>
        </View>

        <View className="flex-row items-center rounded-lg border border-border bg-muted p-0.5">
          <WikiModeButton
            active={mode === 'view'}
            disabled={false}
            label="보기"
            onPress={() => onModeChange?.('view')}
          />
          <WikiModeButton
            active={mode === 'edit'}
            disabled={!actionsEnabled || editModeDisabled}
            label="편집"
            onPress={() => onModeChange?.('edit')}
          />
          <WikiModeButton
            active={mode === 'split'}
            disabled={!actionsEnabled || editModeDisabled}
            label="분할"
            onPress={() => onModeChange?.('split')}
          />
        </View>

        <Button
          accessibilityLabel="문서 기록 보기"
          className="h-8 w-8"
          disabled={!actionsEnabled}
          onPress={onOpenHistory}
          size="icon"
          variant="ghost"
        >
          <Icon as={History} className="size-4 text-muted-foreground" />
        </Button>
        <Button
          accessibilityLabel="마크다운 다운로드"
          className="h-8 w-8"
          disabled={!actionsEnabled}
          onPress={onExport}
          size="icon"
          variant="ghost"
        >
          <Icon as={Download} className="size-4 text-muted-foreground" />
        </Button>
      </View>
    </View>
  );
}

function WikiCollaboratorFacepile({
  collaborators,
}: {
  collaborators: readonly WikiCollaborator[];
}) {
  const visible = collaborators.slice(0, 3);
  const remaining = Math.max(0, collaborators.length - visible.length);
  if (visible.length === 0) return null;

  return (
    <View
      accessibilityLabel={`공동편집 참여자 ${collaborators.map(({ name }) => name).join(', ')}`}
      accessible
      className="hidden flex-row items-center sm:flex"
    >
      {visible.map((collaborator, index) => (
        <View
          className={cn(
            'size-6 items-center justify-center rounded-full border border-background',
            index > 0 && '-ml-1.5',
          )}
          key={collaborator.userId}
          style={{ backgroundColor: collaborator.color }}
        >
          <Text className="text-[9px] font-semibold text-white">
            {collaborator.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ))}
      {remaining > 0 ? (
        <View className="-ml-1.5 size-6 items-center justify-center rounded-full border border-background bg-muted">
          <Text className="text-[9px] font-semibold text-muted-foreground">
            +{remaining}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function WikiModeButton({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 모드`}
      accessibilityState={{ disabled, selected: active }}
      className={cn(
        'rounded-md px-2.5 py-1',
        active ? 'bg-background shadow-sm' : 'web:hover:bg-background/50',
        disabled && 'opacity-40',
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className={cn(
          'text-xs text-muted-foreground',
          active && 'font-medium text-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function indicatorDotClass(tone: WikiCollaborationIndicator['tone']): string {
  switch (tone) {
    case 'saved':
      return 'bg-emerald-500';
    case 'pending':
    case 'warning':
      return 'bg-amber-500';
    case 'readonly':
      return 'bg-muted-foreground';
    case 'error':
      return 'bg-red-500';
  }
}
