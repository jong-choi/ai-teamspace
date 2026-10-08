import { THEME } from '@repo/client/rnr/lib/theme';

import { useColorScheme } from 'nativewind';

/**
 * SVG fill/stroke는 className을 받지 못하므로 RNR THEME의 현재 scheme 값을 쓴다.
 * 새 색을 만들지 않고 semantic token 이름만 그래프 역할에 대응시킨다.
 */
export function useGraphThemePalette() {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === 'dark' ? 'dark' : 'light'];

  return {
    grid: theme.border,
    nodeFill: theme.background,
    nodeStroke: theme.foreground,
    nodeStrokeMuted: theme.mutedForeground,
    nodeStrokeSubtle: theme.ring,
    label: theme.foreground,
    subLabel: theme.ring,
    edge: theme.border,
    edgeLabel: theme.ring,
    active: theme.primary,
  };
}

export type GraphThemePalette = ReturnType<typeof useGraphThemePalette>;
