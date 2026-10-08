import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { GraphMetaBadge } from '@core/features/knowledge-graph/components/graph-badges';

import { MousePointer } from 'lucide-react-native';

/** graph.html 인스펙터: 작은 대문자 제목+배지, 스크롤 본문, 하단 고정 액션. */
export function GraphInspectorFrame({
  badge,
  children,
  footer,
  headerClassName,
}: {
  badge: string;
  children: ReactNode;
  footer?: ReactNode;
  headerClassName?: string;
}) {
  return (
    <View className="min-h-0 flex-1">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="gap-5 p-5"
      >
        <View
          className={cn(
            'flex-row items-center justify-between border-b border-border/60 pb-3',
            headerClassName,
          )}
        >
          <Text className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            엔티티 인스펙터
          </Text>
          <GraphMetaBadge label={badge} />
        </View>
        {children}
      </ScrollView>
      {footer ? (
        <View className="border-t border-border/60 bg-muted/30 p-4">
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function GraphInspectorEmpty({
  headerClassName,
}: {
  headerClassName?: string;
}) {
  return (
    <GraphInspectorFrame
      badge="선택되지 않음"
      headerClassName={headerClassName}
    >
      <View className="items-center gap-2 p-6">
        <Icon
          as={MousePointer}
          className="size-8 text-border"
          strokeWidth={1}
        />
        <Text className="text-center text-xs leading-5 text-muted-foreground">
          그래프상의 노드나 관계를 클릭하여{'\n'}상세 정보 및 관계를 편집하세요.
        </Text>
      </View>
    </GraphInspectorFrame>
  );
}

export function GraphInspectorSkeleton({
  headerClassName,
}: {
  headerClassName?: string;
}) {
  return (
    <GraphInspectorFrame badge="불러오는 중" headerClassName={headerClassName}>
      <View
        accessibilityLabel="선택한 항목을 불러오는 중"
        accessibilityRole="progressbar"
        className="gap-3"
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </View>
    </GraphInspectorFrame>
  );
}

export function GraphInspectorTitle({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  return (
    <View className="gap-1">
      <Text
        className="font-mono text-[10px] uppercase text-muted-foreground"
        selectable
      >
        ID: {id}
      </Text>
      <Text className="text-base font-bold tracking-tight">{title}</Text>
    </View>
  );
}

/** graph.html의 좌표 박스를 속성 표로 확장한다. */
export function GraphInspectorFields({ children }: { children: ReactNode }) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-muted/40 p-3">
      {children}
    </View>
  );
}

export function GraphInspectorField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="font-mono text-[11px] text-muted-foreground">
        {label}
      </Text>
      <View className="min-w-0 shrink flex-row flex-wrap items-center justify-end gap-1">
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text className="text-right font-mono text-[11px]" numberOfLines={2}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function GraphInspectorSectionTitle({
  action,
  title,
}: {
  action?: ReactNode;
  title: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs font-bold">{title}</Text>
      {action}
    </View>
  );
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatGraphDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}
