import { Pressable, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import { Folder, Kanban, List } from 'lucide-react-native';

export type ProjectView = 'overview' | 'board' | 'list';

const VIEW_OPTIONS = [
  { id: 'overview', label: '개요', icon: Folder },
  { id: 'board', label: '보드', icon: Kanban },
  { id: 'list', label: '목록', icon: List },
] as const;

export function ProjectViewSwitcher({
  activeView,
  disabledViews = [],
  onSelectView,
}: {
  activeView: ProjectView;
  disabledViews?: readonly ProjectView[];
  onSelectView: (view: ProjectView) => void;
}) {
  return (
    <View className="flex-row items-center rounded-lg border border-border bg-muted/70 p-0.5">
      {VIEW_OPTIONS.map((option) => {
        const active = option.id === activeView;
        const disabled = disabledViews.includes(option.id);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: active }}
            className={cn(
              'flex-row items-center gap-1.5 rounded-md px-2 py-1',
              active ? 'bg-background shadow-sm' : 'web:hover:bg-background/60',
              disabled && 'opacity-40',
            )}
            disabled={disabled}
            key={option.id}
            onPress={() => onSelectView(option.id)}
          >
            <Icon
              as={option.icon}
              className={cn(
                'size-3.5',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            />
            <Text
              className={cn(
                'hidden text-xs font-medium sm:flex',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
