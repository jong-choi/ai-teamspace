import { useEffect, useState } from 'react';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@repo/client/rnr/components/ui/tabs';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  DashboardBreadcrumbItem,
  DashboardBreadcrumbSeparator,
  DashboardPageHeader,
} from '@core/app/shell/dashboard-page-header';
import { DashboardSearchInput } from '@core/app/ui/dashboard-search-input';

import { Plus, Share2, Table } from 'lucide-react-native';

export type GraphStudioView = 'graph' | 'data';

/** 공통 상단 바 위의 지식 그래프 도구: 검색 · 보기 전환 · 새 엔티티 추가. */
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
    <DashboardPageHeader
      actions={
        <>
          {!compact && view === 'graph' ? (
            <DashboardSearchInput
              accessibilityLabel="지식 그래프 검색"
              className="w-48"
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
            <TabsList className="h-auto rounded-lg border border-border p-0.5">
              <TabsTrigger className="px-2.5 py-1" value="graph">
                <Icon as={Share2} className="size-3.5 text-muted-foreground" />
                <Text className="text-xs">그래프</Text>
              </TabsTrigger>
              <TabsTrigger className="px-2.5 py-1" value="data">
                <Icon as={Table} className="size-3.5 text-muted-foreground" />
                <Text className="text-xs">
                  {compact ? '데이터' : '데이터 센터'}
                </Text>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            accessibilityLabel="새 엔티티 추가"
            onPress={onCreate}
            size={compact ? 'icon' : 'sm'}
          >
            <Icon as={Plus} className="size-3.5 text-primary-foreground" />
            {compact ? null : (
              <Text className="text-xs text-primary-foreground">
                새 엔티티 추가
              </Text>
            )}
          </Button>
        </>
      }
      className="z-30"
    >
      <DashboardBreadcrumbItem>지식 그래프</DashboardBreadcrumbItem>
      <DashboardBreadcrumbSeparator />
      <DashboardBreadcrumbItem current>
        {view === 'graph' ? '그래프 뷰' : '데이터 센터'}
      </DashboardBreadcrumbItem>
    </DashboardPageHeader>
  );
}
