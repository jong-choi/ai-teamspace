import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import {
  ArrowUpRight,
  Box,
  type LucideIcon,
  Maximize2,
  Scan,
  ZoomIn,
  ZoomOut,
} from 'lucide-react-native';

/** 좌상단 overlay: 확대·축소·화면 맞춤·원점 + 배율, 그 아래 통계 한 줄. */
export function GraphCanvasToolbar({
  edgeCount,
  canExpand,
  canLoadMore,
  nodeCount,
  onExpand,
  onFit,
  onLoadMore,
  onReset,
  onZoomIn,
  onZoomOut,
  zoomPercent,
  statusLabel,
}: {
  canExpand: boolean;
  canLoadMore: boolean;
  edgeCount: number;
  nodeCount: number;
  onExpand: () => void;
  onFit: () => void;
  onLoadMore: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomPercent: number;
  statusLabel: string;
}) {
  return (
    <View className="absolute left-4 top-4 z-20 gap-2" pointerEvents="box-none">
      <View className="flex-row items-center gap-1 self-start rounded-xl border border-border bg-background/90 p-1.5 shadow-sm">
        <GraphToolbarButton icon={ZoomIn} label="확대 (+)" onPress={onZoomIn} />
        <GraphToolbarButton
          icon={ZoomOut}
          label="축소 (-)"
          onPress={onZoomOut}
        />
        <GraphToolbarButton
          icon={Scan}
          label="화면에 맞춤 (F)"
          onPress={onFit}
        />
        <GraphToolbarButton
          icon={Maximize2}
          label="원점 100% (0)"
          onPress={onReset}
        />
        <View className="mx-1 h-4 w-px bg-border" />
        <Text
          accessibilityLabel={`현재 배율 ${zoomPercent}%`}
          className="min-w-9 px-1 text-center font-mono text-[11px] font-medium text-muted-foreground"
        >
          {zoomPercent}%
        </Text>
      </View>

      <View className="flex-row items-center gap-3 self-start rounded-xl border border-border bg-background/90 px-3 py-1.5 shadow-sm">
        <View className="flex-row items-center gap-1.5">
          <View className="size-2 rounded-full bg-ring" />
          <Text className="text-xs font-medium text-muted-foreground">
            드래그 이동 가능
          </Text>
        </View>
        <Text className="text-xs text-border">|</Text>
        <Text className="font-mono text-xs">노드: {nodeCount}</Text>
        <Text className="font-mono text-xs">관계: {edgeCount}</Text>
        <Text className="text-xs text-muted-foreground">{statusLabel}</Text>
      </View>
      {canExpand || canLoadMore ? (
        <View className="flex-row gap-1 self-start rounded-xl border border-border bg-background/90 p-1.5 shadow-sm">
          {canExpand ? (
            <Button onPress={onExpand} size="sm" variant="ghost">
              <Text className="text-[11px]">2단계 관계 추가</Text>
            </Button>
          ) : null}
          {canLoadMore ? (
            <Button onPress={onLoadMore} size="sm" variant="ghost">
              <Text className="text-[11px]">다음 결과 더 보기</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function GraphToolbarButton({
  icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={label}
      className="h-7 w-7 rounded-lg sm:h-7 sm:w-7"
      hitSlop={6}
      onPress={onPress}
      size="icon"
      variant="ghost"
    >
      <Icon as={icon} className="size-4 text-muted-foreground" />
    </Button>
  );
}

/** 좌하단 빠른 생성: 노드 추가 → 관계 연결 순서를 유지한다. */
export function GraphCanvasQuickActions({
  onAddEdge,
  onAddNode,
}: {
  onAddEdge: () => void;
  onAddNode: () => void;
}) {
  return (
    <View
      className="absolute bottom-4 left-4 z-20 flex-row gap-2"
      pointerEvents="box-none"
    >
      <Button
        className="rounded-lg"
        onPress={onAddNode}
        size="sm"
        variant="outline"
      >
        <Icon as={Box} className="size-4 text-muted-foreground" />
        <Text className="text-xs font-semibold">노드 추가</Text>
      </Button>
      <Button
        className="rounded-lg"
        onPress={onAddEdge}
        size="sm"
        variant="outline"
      >
        <Icon as={ArrowUpRight} className="size-4 text-muted-foreground" />
        <Text className="text-xs font-semibold">관계 연결</Text>
      </Button>
    </View>
  );
}
