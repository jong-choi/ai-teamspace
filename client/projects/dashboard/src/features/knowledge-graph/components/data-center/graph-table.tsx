import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import type { LucideIcon } from 'lucide-react-native';

export type GraphTableColumn = {
  key: string;
  label: string;
  // 고정 폭 column과 남는 폭을 쓰는 column을 섞는다.
  className: string;
  align?: 'right';
};

/** graph.html 데이터 표: 흰 카드, 옅은 header, 조밀한 row. 모바일은 가로 스크롤로 column을 유지한다. */
export function GraphTable({
  children,
  columns,
}: {
  children: ReactNode;
  columns: readonly GraphTableColumn[];
}) {
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <ScrollView contentContainerClassName="min-w-full" horizontal>
        <View className="min-w-[860px] flex-1">
          <View className="flex-row border-b border-border bg-muted/50">
            {columns.map((column) => (
              <View className={cn('p-3.5', column.className)} key={column.key}>
                <Text
                  className={cn(
                    'font-mono text-[11px] font-medium text-muted-foreground',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.label}
                </Text>
              </View>
            ))}
          </View>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

// row 자체는 누를 수 없다. Web에서 button 안에 작업 button이 중첩되지 않도록 표시명과 보기 버튼으로 선택한다.
export function GraphTableRow({
  children,
  selected,
}: {
  children: ReactNode;
  selected: boolean;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center border-b border-border/60 web:hover:bg-muted/40',
        selected && 'bg-muted/60',
      )}
    >
      {children}
    </View>
  );
}

export function GraphTableTitleButton({
  accessibilityLabel,
  label,
  mono = false,
  onPress,
}: {
  accessibilityLabel: string;
  label: string;
  mono?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="min-w-0 shrink"
      hitSlop={6}
      onPress={onPress}
    >
      <Text
        className={cn(
          'text-xs web:hover:underline',
          mono ? 'font-mono text-[11px]' : 'font-semibold',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function GraphTableCell({
  align,
  children,
  className,
}: {
  align?: 'right';
  children: ReactNode;
  className: string;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 px-3.5 py-2.5',
        align === 'right' && 'justify-end',
        className,
      )}
    >
      {children}
    </View>
  );
}

export function GraphTableEmpty({ message }: { message: string }) {
  return (
    <View className="p-8">
      <Text className="text-center text-xs italic text-muted-foreground">
        {message}
      </Text>
    </View>
  );
}

export function GraphTableSkeleton({
  columns,
}: {
  columns: readonly GraphTableColumn[];
}) {
  return (
    <GraphTable columns={columns}>
      <View
        accessibilityLabel="표를 불러오는 중"
        accessibilityRole="progressbar"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <View className="flex-row border-b border-border/60" key={index}>
            {columns.map((column) => (
              <View className={cn('p-3.5', column.className)} key={column.key}>
                <Skeleton className="h-3.5 w-3/4" />
              </View>
            ))}
          </View>
        ))}
      </View>
    </GraphTable>
  );
}

export function GraphRowActionButton({
  destructive = false,
  icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={label}
      className={cn(
        'h-7 w-7 rounded sm:h-7 sm:w-7',
        destructive && 'web:hover:bg-destructive/10',
      )}
      hitSlop={6}
      onPress={onPress}
      size="icon"
      variant="ghost"
    >
      <Icon
        as={icon}
        className={cn(
          'size-3.5',
          destructive ? 'text-destructive' : 'text-muted-foreground',
        )}
      />
    </Button>
  );
}

export function GraphPagination({
  canPrevious,
  label,
  nextCursor,
  onNext,
  onPrevious,
  pageIndex,
}: {
  canPrevious: boolean;
  label: string;
  nextCursor: string | null;
  onNext: () => void;
  onPrevious: () => void;
  pageIndex: number;
}) {
  return (
    <View className="flex-row items-center justify-between px-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <View className="flex-row items-center gap-1">
        <Button
          className="h-7 rounded-lg px-2.5"
          disabled={!canPrevious}
          onPress={onPrevious}
          size="sm"
          variant="outline"
        >
          <Text className="text-xs text-muted-foreground">이전</Text>
        </Button>
        <Text className="px-2 font-mono text-xs">{pageIndex + 1}</Text>
        <Button
          className="h-7 rounded-lg px-2.5"
          disabled={!nextCursor}
          onPress={onNext}
          size="sm"
          variant="outline"
        >
          <Text className="text-xs text-muted-foreground">다음</Text>
        </Button>
      </View>
    </View>
  );
}
