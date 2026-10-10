import { useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardSearchInput } from '@core/app/ui/dashboard-search-input';
import { GRAPH_NODE_KIND_META } from '@core/features/knowledge-graph/lib/graph-presentation';
import {
  GRAPH_EDGE_RELATIONS,
  GRAPH_NODE_KINDS,
  GRAPH_PAGE_SIZES,
  type GraphDataCenterParams,
} from '@core/features/knowledge-graph/lib/graph-route-params';

const SEARCH_COMMIT_DELAY_MS = 300;
const ALL = 'all';

export function GraphDataFilterBar({
  onChange,
  params,
}: {
  onChange: (patch: Partial<GraphDataCenterParams>) => void;
  params: GraphDataCenterParams;
}) {
  const [search, setSearch] = useState(params.search);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSearch = (value: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (value.trim() !== params.search) onChange({ search: value.trim() });
  };

  return (
    <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <View className="min-w-[240px] flex-1 flex-row items-center gap-2">
        {params.tab === 'nodes' ? (
          <DashboardSearchInput
            accessibilityLabel="이름, ID 또는 키워드 검색"
            className="flex-1"
            onChangeText={(next) => {
              setSearch(next);
              if (commitTimer.current) clearTimeout(commitTimer.current);
              commitTimer.current = setTimeout(
                () => commitSearch(next),
                SEARCH_COMMIT_DELAY_MS,
              );
            }}
            onSubmitEditing={() => commitSearch(search)}
            placeholder="이름, ID 또는 키워드 검색..."
            returnKeyType="search"
            value={search}
          />
        ) : null}
        {params.tab === 'nodes' ? (
          <Select
            onValueChange={(option) =>
              onChange({
                kind:
                  GRAPH_NODE_KINDS.find(
                    (candidate) => candidate === option?.value,
                  ) ?? ALL,
              })
            }
            value={{
              value: params.kind,
              label:
                params.kind === ALL
                  ? '전체 카테고리'
                  : kindOptionLabel(params.kind),
            }}
          >
            <SelectTrigger
              accessibilityLabel="카테고리 필터"
              className="sm:h-8"
              size="sm"
            >
              <SelectValue className="text-xs" placeholder="전체 카테고리" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              <SelectItem label="전체 카테고리" value={ALL}>
                전체 카테고리
              </SelectItem>
              {GRAPH_NODE_KINDS.map((kind) => (
                <SelectItem
                  key={kind}
                  label={kindOptionLabel(kind)}
                  value={kind}
                >
                  {kindOptionLabel(kind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select
            onValueChange={(option) =>
              onChange({
                relation:
                  GRAPH_EDGE_RELATIONS.find(
                    (candidate) => candidate === option?.value,
                  ) ?? ALL,
              })
            }
            value={{
              value: params.relation,
              label: params.relation === ALL ? '전체 관계' : params.relation,
            }}
          >
            <SelectTrigger
              accessibilityLabel="관계 종류 필터"
              className="sm:h-8"
              size="sm"
            >
              <SelectValue className="text-xs" placeholder="전체 관계" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              <SelectItem label="전체 관계" value={ALL}>
                전체 관계
              </SelectItem>
              {GRAPH_EDGE_RELATIONS.map((relation) => (
                <SelectItem key={relation} label={relation} value={relation}>
                  {relation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-xs text-muted-foreground">페이지당 항목:</Text>
        <Select
          onValueChange={(option) => {
            const pageSize = GRAPH_PAGE_SIZES.find(
              (candidate) => String(candidate) === option?.value,
            );
            if (pageSize) onChange({ pageSize });
          }}
          value={{
            value: String(params.pageSize),
            label: `${params.pageSize}개`,
          }}
        >
          <SelectTrigger
            accessibilityLabel="페이지당 항목 수"
            className="sm:h-8"
            size="sm"
          >
            <SelectValue className="text-xs" placeholder="10개" />
          </SelectTrigger>
          <SelectContent align="end" side="bottom">
            {GRAPH_PAGE_SIZES.map((size) => (
              <SelectItem key={size} label={`${size}개`} value={String(size)}>
                {`${size}개`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>
    </View>
  );
}

function kindOptionLabel(kind: (typeof GRAPH_NODE_KINDS)[number]) {
  const meta = GRAPH_NODE_KIND_META[kind];
  return `${meta.code} (${meta.label})`;
}
