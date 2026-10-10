import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardSearchInput } from '@core/app/ui/dashboard-search-input';

import { ArrowRight, X } from 'lucide-react-native';

export function GraphFloatingSearch({
  onSearch,
  value,
}: {
  onSearch: (query: string) => void;
  value: string;
}) {
  const [search, setSearch] = useState(value);
  useEffect(() => setSearch(value), [value]);

  const submit = () => onSearch(search.trim());
  const clear = () => {
    setSearch('');
    onSearch('');
  };

  return (
    <View
      className="absolute inset-x-4 top-4 z-30 items-center"
      pointerEvents="box-none"
    >
      <View className="w-full max-w-xl flex-row items-center gap-2 rounded-2xl border border-border bg-background/95 p-2 shadow-lg shadow-black/10">
        <DashboardSearchInput
          accessibilityLabel="지식 그래프 검색"
          className="min-w-0 flex-1"
          onChangeText={setSearch}
          onSubmitEditing={submit}
          placeholder="위키, 프로젝트, 사람, 개념 검색..."
          returnKeyType="search"
          value={search}
        />
        {search ? (
          <Button
            accessibilityLabel="지식 그래프 검색어 지우기"
            className="h-8 w-8 rounded-lg"
            onPress={clear}
            size="icon"
            variant="ghost"
          >
            <Icon as={X} className="size-4 text-muted-foreground" />
          </Button>
        ) : null}
        <Button className="h-8 rounded-lg px-3" onPress={submit} size="sm">
          <Text className="text-xs font-semibold text-primary-foreground">
            검색
          </Text>
          <Icon as={ArrowRight} className="size-3.5 text-primary-foreground" />
        </Button>
      </View>
    </View>
  );
}
