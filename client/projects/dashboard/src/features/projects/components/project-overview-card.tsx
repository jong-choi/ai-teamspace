import { Pressable, View } from 'react-native';

import type { ProjectSummary } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import { ArrowRight, Kanban, List } from 'lucide-react-native';

export function ProjectOverviewCard({
  onOpenBoard,
  onOpenList,
  project,
}: {
  onOpenBoard: () => void;
  onOpenList: () => void;
  project: ProjectSummary;
}) {
  const totalTicketCount = project.activeTicketCount + project.doneTicketCount;
  const completion =
    totalTicketCount === 0
      ? 0
      : Math.round((project.doneTicketCount / totalTicketCount) * 100);

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-5 shadow-sm web:hover:border-muted-foreground/40 web:hover:shadow-md">
      <View className="flex-row items-center justify-between">
        <Text className="text-[10px] text-muted-foreground">
          {formatUpdatedAt(project.updatedAt)} 업데이트
        </Text>
        <View className="flex-row gap-1.5">
          <Pressable
            accessibilityLabel={`${project.name} 목록 열기`}
            className="rounded p-1 web:hover:bg-muted"
            onPress={onOpenList}
          >
            <Icon as={List} className="size-3.5 text-muted-foreground" />
          </Pressable>
          <Pressable
            accessibilityLabel={`${project.name} 보드 열기`}
            className="rounded p-1 web:hover:bg-muted"
            onPress={onOpenBoard}
          >
            <Icon as={Kanban} className="size-3.5 text-muted-foreground" />
          </Pressable>
        </View>
      </View>

      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="font-mono text-xs text-muted-foreground">
            {project.key}
          </Text>
          <Text className="min-w-0 flex-1 truncate text-sm font-bold">
            {project.name}
          </Text>
        </View>
        <Text
          className="min-h-10 text-xs leading-5 text-muted-foreground"
          numberOfLines={2}
        >
          {project.description || '프로젝트 설명이 없습니다.'}
        </Text>
      </View>

      <View className="gap-1.5 pt-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] text-muted-foreground">
            이슈 {project.activeTicketCount}개 활성
          </Text>
          <Text className="text-[11px] font-medium">{completion}%</Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-muted">
          <View
            className="h-full rounded-full bg-foreground"
            style={{ width: `${completion}%` }}
          />
        </View>
      </View>

      <View className="flex-row items-center justify-between border-t border-border/70 pt-2">
        <Text className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          리드: {project.lead?.name ?? '미지정'}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-1 rounded px-1.5 py-1 web:hover:bg-muted"
          onPress={onOpenBoard}
        >
          <Text className="text-[11px] font-medium">이슈 열기</Text>
          <Icon as={ArrowRight} className="size-3 text-muted-foreground" />
        </Pressable>
      </View>
    </View>
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
