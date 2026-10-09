import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@repo/client/rnr/components/ui/tabs';
import { Text } from '@repo/client/rnr/components/ui/text';
import { GraphMetaBadge } from '@core/features/knowledge-graph/components/graph-badges';

import { Network, Plus, Share2, Table } from 'lucide-react-native';

export type GraphStudioView = 'graph' | 'data';

/** graph.html의 h-14 내부 header: 제목 · 보기 전환 · 구분선 · 새 엔티티 추가. */
export function GraphStudioHeader({
  compact,
  onCreate,
  onSearch,
  onViewChange,
  searchValue,
  view,
}: {
  compact: boolean;
  onCreate: () => void;
  onSearch: (query: string) => void;
  onViewChange: (view: GraphStudioView) => void;
  searchValue: string;
  view: GraphStudioView;
}) {
  const [search, setSearch] = useState(searchValue);
  useEffect(() => setSearch(searchValue), [searchValue]);
  return (
    <View className="z-30 h-14 shrink-0 flex-row items-center justify-between gap-3 border-b border-border bg-background/90 px-4 shadow-sm md:px-6">
      <View className="min-w-0 flex-row items-center gap-3">
        <View className="items-center justify-center rounded-lg bg-primary p-2">
          <Icon as={Network} className="size-4 text-primary-foreground" />
        </View>
        <View className="min-w-0 flex-row items-center gap-2">
          <Text className="text-sm font-semibold tracking-tight">
            지식 그래프
          </Text>
          {compact ? null : (
            <>
              <Text className="text-sm text-border">/</Text>
              <GraphMetaBadge className="px-2" label="Knowledge Graph Studio" />
            </>
          )}
        </View>
      </View>

      <View className="flex-row items-center gap-3">
        {!compact && view === 'graph' ? (
          <Input
            accessibilityLabel="지식 그래프 검색"
            className="h-8 w-48 text-xs md:text-xs"
            onChangeText={setSearch}
            onSubmitEditing={() => onSearch(search.trim())}
            placeholder="노드 검색..."
            returnKeyType="search"
            value={search}
          />
        ) : null}
        <Tabs
          onValueChange={(value) =>
            onViewChange(value === 'data' ? 'data' : 'graph')
          }
          value={view}
        >
          <TabsList className="h-auto border border-border p-1">
            <TabsTrigger className="px-3 py-1.5" value="graph">
              <Icon as={Share2} className="size-3.5 text-muted-foreground" />
              <Text className="text-xs">
                {compact ? '그래프' : '인터랙티브 그래프 뷰'}
              </Text>
            </TabsTrigger>
            <TabsTrigger className="px-3 py-1.5" value="data">
              <Icon as={Table} className="size-3.5 text-muted-foreground" />
              <Text className="text-xs">
                {compact ? '데이터' : '데이터 센터'}
              </Text>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <View className="h-4 w-px bg-border" />

        <Button
          accessibilityLabel="새 엔티티 추가"
          className="rounded-lg"
          onPress={onCreate}
          size={compact ? 'icon' : 'sm'}
        >
          <Icon as={Plus} className="size-3.5 text-primary-foreground" />
          {compact ? null : <Text className="text-xs">새 엔티티 추가</Text>}
        </Button>
      </View>
    </View>
  );
}
