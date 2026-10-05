import { Pressable, ScrollView, View } from 'react-native';

import type {
  WikiTree,
  WikiTreeDocument,
} from '@repo/client/api-client/schemas';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getWikiDocumentBreadcrumb } from '@core/features/wiki/wiki-tree-model';

import { Download, FolderTree } from 'lucide-react-native';

type WikiHeaderProps = {
  activeDocument?: WikiTreeDocument;
  onOpenTree: () => void;
  onOpenWikiRoot: () => void;
  tree: WikiTree;
};

export function WikiHeader({
  activeDocument,
  onOpenTree,
  onOpenWikiRoot,
  tree,
}: WikiHeaderProps) {
  const breadcrumb = activeDocument
    ? getWikiDocumentBreadcrumb(tree, activeDocument)
    : [{ id: 'wiki' as const, kind: 'root' as const, label: '위키' as const }];

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
        <View className="hidden flex-row items-center gap-1.5 sm:flex">
          <View className="size-1.5 rounded-full bg-muted-foreground/50" />
          <Text className="text-[11px] text-muted-foreground">읽기 전용</Text>
        </View>

        <View className="flex-row items-center rounded-lg border border-border bg-muted p-0.5">
          <View className="rounded-md bg-background px-2.5 py-1 shadow-sm">
            <Text className="text-xs font-medium">보기</Text>
          </View>
          <View className="px-2.5 py-1 opacity-40">
            <Text className="text-xs text-muted-foreground">편집</Text>
          </View>
          <View className="hidden px-2.5 py-1 opacity-40 sm:flex">
            <Text className="text-xs text-muted-foreground">분할</Text>
          </View>
        </View>

        <Button
          accessibilityLabel="마크다운 다운로드는 편집 단계에서 지원합니다"
          className="h-8 w-8"
          disabled
          size="icon"
          variant="ghost"
        >
          <Icon as={Download} className="size-4 text-muted-foreground" />
        </Button>
      </View>
    </View>
  );
}
