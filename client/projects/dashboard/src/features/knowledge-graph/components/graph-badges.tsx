import { View } from 'react-native';

import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import type { GraphProjectionState } from '@repo/client/api-client/generated/schemas/graphProjectionState.zod';
import { Badge } from '@repo/client/rnr/components/ui/badge';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  GRAPH_FACT_CLASS_META,
  GRAPH_PROJECTION_META,
} from '@core/features/knowledge-graph/lib/graph-presentation';

/** graph.html의 카테고리·서술어 배지: rounded-md, 옅은 바탕, 10px 글자. */
export function GraphMetaBadge({
  className,
  label,
  mono = false,
}: {
  className?: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <Badge className={cn('rounded-md bg-muted', className)} variant="outline">
      <Text
        className={cn('text-[10px] font-semibold', mono && 'font-mono')}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Badge>
  );
}

// 캔버스 선 패턴과 같은 모양을 배지에도 붙여 색 없이 출처를 구분한다.
export function GraphFactClassBadge({
  factClass,
}: {
  factClass: GraphNode['factClass'];
}) {
  return (
    <Badge
      accessibilityLabel={`출처 ${GRAPH_FACT_CLASS_META[factClass].label}`}
      className="rounded-md"
      variant="outline"
    >
      <View
        className={cn(
          'w-3 border-t-[1.5px] border-foreground',
          factClass === 'extracted' && 'border-dashed border-ring',
          factClass === 'user_curated' &&
            'border-dotted border-muted-foreground',
        )}
      />
      <Text className="text-[10px] font-medium">
        {GRAPH_FACT_CLASS_META[factClass].label}
      </Text>
    </Badge>
  );
}

export function GraphProjectionBadge({
  projection,
}: {
  projection: GraphProjectionState | null;
}) {
  if (!projection || projection.status === 'applied') return null;
  return (
    <Badge className="rounded-md" variant="secondary">
      <View className="size-1.5 rounded-full bg-muted-foreground" />
      <Text className="text-[10px] font-medium">
        {GRAPH_PROJECTION_META[projection.status].label}
      </Text>
    </Badge>
  );
}
