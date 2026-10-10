import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useAppearanceStore } from '@core/app/appearance/appearance-provider';

import { Moon, Sun } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

type ThemeToggleProps = {
  expanded?: boolean;
};

export function ThemeToggle({ expanded = false }: ThemeToggleProps) {
  const { colorScheme } = useColorScheme();
  const setThemeMode = useAppearanceStore((state) => state.setThemeMode);
  const dark = colorScheme === 'dark';

  return (
    <Button
      accessibilityLabel="테마 모드 전환"
      className={cn(
        expanded ? 'h-auto w-full justify-start px-3 py-2' : 'h-8 w-8',
      )}
      onPress={() => setThemeMode(dark ? 'light' : 'dark')}
      size={expanded ? 'sm' : 'icon'}
      variant="ghost"
    >
      <Icon as={dark ? Sun : Moon} className="size-4 text-muted-foreground" />
      {expanded ? (
        <Text className="text-xs text-muted-foreground">테마 모드 전환</Text>
      ) : null}
    </Button>
  );
}
