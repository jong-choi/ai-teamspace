import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

// 여러 선택지 중 하나를 고르는 작은 버튼이다. leading에 색 견본 같은 표시를 둘 수 있다.
export function ChoiceChip({
  disabled = false,
  label,
  leading,
  onPress,
  selected,
}: {
  disabled?: boolean;
  label: string;
  leading?: ReactNode;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      className={cn(
        'h-8 flex-row items-center justify-center gap-1.5 rounded-md border px-2.5',
        selected ? 'border-primary bg-primary/5' : 'border-border',
        disabled && 'opacity-50',
      )}
      disabled={disabled}
      onPress={onPress}
    >
      {leading}
      <Text className={cn('text-xs', selected && 'font-medium')}>{label}</Text>
    </Pressable>
  );
}
