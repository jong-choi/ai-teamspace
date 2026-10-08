import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import type { GraphRecordAction } from '@core/features/knowledge-graph/lib/graph-permission';

import {
  Edit3,
  ExternalLink,
  EyeOff,
  PencilLine,
  Trash2,
} from 'lucide-react-native';

/**
 * graph.html 인스펙터 footer: 넓은 편집 버튼 + 오른쪽 작은 삭제 버튼.
 * AI 정정·숨김·원본 열기도 같은 두 칸 배치에 담는다.
 */
export function GraphInspectorActions({
  actions,
  editLabel,
  onCorrect,
  onDelete,
  onEdit,
  onOpenSource,
  readOnlyMessage,
}: {
  actions: ReadonlySet<GraphRecordAction>;
  editLabel: string;
  onCorrect?: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpenSource?: () => void;
  readOnlyMessage: string;
}) {
  const removable = actions.has('delete') || actions.has('suppress');
  const primary = actions.has('edit')
    ? { icon: Edit3, label: editLabel, onPress: onEdit }
    : actions.has('correct') && onCorrect
      ? { icon: PencilLine, label: '추출 결과 정정', onPress: onCorrect }
      : actions.has('open-source') && onOpenSource
        ? { icon: ExternalLink, label: '원본 열기', onPress: onOpenSource }
        : null;

  if (!primary && !removable) {
    return (
      <Text className="text-center text-[11px] leading-4 text-muted-foreground">
        {readOnlyMessage}
      </Text>
    );
  }

  return (
    <View className="flex-row gap-2">
      {primary ? (
        <Button
          className="flex-1 rounded-lg"
          onPress={primary.onPress}
          size="sm"
          variant="outline"
        >
          <Icon as={primary.icon} className="size-3.5 text-muted-foreground" />
          <Text className="text-xs font-semibold">{primary.label}</Text>
        </Button>
      ) : null}
      {removable ? (
        <Button
          accessibilityLabel={
            actions.has('suppress') ? '추출 결과 숨김' : '삭제'
          }
          className="rounded-lg border-destructive/30 bg-destructive/10 px-3"
          hitSlop={4}
          onPress={onDelete}
          size="sm"
          variant="outline"
        >
          <Icon
            as={actions.has('suppress') ? EyeOff : Trash2}
            className="size-3.5 text-destructive"
          />
        </Button>
      ) : null}
    </View>
  );
}
