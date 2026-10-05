import { Pressable, ScrollView, View } from 'react-native';

import type {
  WikiTree,
  WikiTreeDocument,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import type {
  WikiEditorMode,
  WikiSaveIndicator,
} from '@core/features/wiki/use-wiki-edit-session';
import { getWikiDocumentBreadcrumb } from '@core/features/wiki/wiki-tree-model';

import { Download, FolderTree, History } from 'lucide-react-native';

type WikiHeaderProps = {
  activeDocument?: WikiTreeDocument;
  mode?: WikiEditorMode;
  modeChangePending?: boolean;
  onExport?: () => void;
  onModeChange?: (mode: WikiEditorMode) => void;
  onOpenHistory?: () => void;
  onOpenTree: () => void;
  onOpenWikiRoot: () => void;
  saveIndicator?: WikiSaveIndicator;
  tree: WikiTree;
};

const defaultIndicator: WikiSaveIndicator = {
  label: '읽기 전용',
  tone: 'saved',
};

export function WikiHeader({
  activeDocument,
  mode = 'view',
  modeChangePending = false,
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
        <View
          accessibilityLabel={`저장 상태: ${saveIndicator.label}`}
          accessible
          className="flex-row items-center gap-1.5"
        >
          <View
            className={cn(
              'size-1.5 rounded-full',
              saveIndicatorDotClass(saveIndicator.tone),
            )}
          />
          <Text className="hidden text-[11px] text-muted-foreground sm:flex">
            {saveIndicator.label}
          </Text>
        </View>

        <View className="flex-row items-center rounded-lg border border-border bg-muted p-0.5">
          <WikiModeButton
            active={mode === 'view'}
            disabled={modeChangePending}
            label="보기"
            onPress={() => onModeChange?.('view')}
          />
          <WikiModeButton
            active={mode === 'edit'}
            disabled={!actionsEnabled || modeChangePending}
            label="편집"
            onPress={() => onModeChange?.('edit')}
          />
          <WikiModeButton
            active={mode === 'split'}
            disabled={!actionsEnabled || modeChangePending}
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

function WikiModeButton({
  active,
  className,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  className?: string;
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
        className,
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

function saveIndicatorDotClass(tone: WikiSaveIndicator['tone']): string {
  switch (tone) {
    case 'saved':
      return 'bg-emerald-500';
    case 'pending':
    case 'warning':
      return 'bg-amber-500';
    case 'locked':
    case 'error':
      return 'bg-red-500';
  }
}
