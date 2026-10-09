import { Pressable, View } from 'react-native';

import { useKnowledgeGraphSearchControllerSearchSuspense } from '@repo/client/api-client';
import type { KnowledgeGraphSearchResponse } from '@repo/client/api-client/generated/schemas/knowledgeGraphSearchResponse.zod';
import { Text } from '@repo/client/rnr/components/ui/text';
import { GraphMetaBadge } from '@core/features/knowledge-graph/components/graph-badges';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

export function GraphSearchSummary({
  organizationId,
  query,
}: {
  organizationId: string;
  query: string;
}) {
  const result = useKnowledgeGraphSearchControllerSearchSuspense(
    organizationId,
    { q: query, mode: 'hybrid', limit: 5 },
  ).data;
  const select = useGraphStudioStore((state) => state.select);

  return (
    <View
      accessibilityLabel={`검색 결과 ${result.items.length}개`}
      className="absolute bottom-4 right-4 z-20 max-h-64 w-72 max-w-[45%] rounded-xl border border-border bg-background/95 p-3 shadow-sm"
    >
      <View className="mb-2 flex-row flex-wrap items-center gap-1.5">
        <Text className="mr-auto text-xs font-semibold" numberOfLines={1}>
          검색 결과
        </Text>
        <GraphMetaBadge label={semanticRecallLabel(result.semanticRecall)} />
        <GraphMetaBadge
          label={result.completeness === 'complete' ? '전체' : '부분'}
        />
      </View>
      {result.degradedReasons.length > 0 ? (
        <Text className="mb-2 text-[10px] text-muted-foreground">
          {result.degradedReasons.map(degradedReasonLabel).join(' · ')}
        </Text>
      ) : null}
      <View accessibilityLabel="검색된 Wiki 노드 목록" className="gap-1">
        {result.items.length === 0 ? (
          <Text className="py-2 text-xs text-muted-foreground">
            일치하는 Wiki 문서가 없습니다.
          </Text>
        ) : (
          result.items.map((item) => (
            <Pressable
              accessibilityLabel={`${item.source.title}, ${item.matchedBy.join(' 및 ')} 검색 결과`}
              accessibilityRole="button"
              className="rounded-md px-2 py-1.5 hover:bg-muted"
              key={item.source.nodeId}
              onPress={() => select({ kind: 'node', id: item.source.nodeId })}
            >
              <Text className="text-xs font-medium" numberOfLines={1}>
                {item.source.title}
              </Text>
              <Text
                className="text-[10px] text-muted-foreground"
                numberOfLines={1}
              >
                {item.matchedBy.join(' + ')} · #{item.fusedRank}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

export function semanticRecallLabel(
  recall: KnowledgeGraphSearchResponse['semanticRecall'],
): string {
  if (recall === 'exact') return '의미 검색 정확';
  if (recall === 'approximate') return '의미 검색 근사';
  return '키워드 검색';
}

function degradedReasonLabel(
  reason: KnowledgeGraphSearchResponse['degradedReasons'][number],
): string {
  if (reason === 'graph_unavailable') return '그래프 조회 지연';
  if (reason === 'projection_pending') return '그래프 반영 대기';
  return '의미 검색 비활성';
}
