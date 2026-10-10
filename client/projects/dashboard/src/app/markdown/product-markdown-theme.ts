import { useMemo } from 'react';

import {
  useAppearanceStore,
  useAppearanceTokens,
} from '@core/app/appearance/appearance-provider';
import type { FontSizePreference } from '@core/app/appearance/appearance-schema';

import { useColorScheme } from 'nativewind';

// 마크다운 스타일의 글자 크기는 className을 쓸 수 없어 숫자다. 본문 text-sm의 단계별 크기(13·14·16px) 비율을 따른다.
const MARKDOWN_FONT_SCALES: Record<FontSizePreference, number> = {
  small: 1,
  medium: 14 / 13,
  large: 16 / 13,
};

// 글자 크기 설정을 반영한 마크다운 글자 크기·줄 높이다.
export function scaleMarkdownFont(
  palette: Pick<ProductMarkdownPalette, 'fontScale'>,
  size: number,
): number {
  return Math.round(size * palette.fontScale);
}

export type ProductMarkdownPalette = {
  border: string;
  // 글자 크기 설정에 따른 배율이다. 기본(작게)이 1이다.
  fontScale: number;
  foreground: string;
  link: string;
  muted: string;
  placeholder: string;
  strongBorder: string;
  surface: string;
};

// 마크다운 스타일은 className을 받지 못하므로 현재 테마에서 계산된 색 값을 쓴다.
// platform이 값을 읽지 못하면 라이트·다크 기본 색을 쓴다.
export function useProductMarkdownPalette(): ProductMarkdownPalette {
  const { colorScheme } = useColorScheme();
  const tokens = useAppearanceTokens();
  const fontSizePreference = useAppearanceStore(
    (state) => state.applied.fontSizePreference,
  );
  const dark = colorScheme === 'dark';
  const fontScale = MARKDOWN_FONT_SCALES[fontSizePreference];

  return useMemo(
    () =>
      tokens
        ? {
            border: tokens.border,
            fontScale,
            foreground: tokens.foreground,
            link: tokens.primary,
            muted: tokens.mutedForeground,
            placeholder: tokens.mutedForeground,
            strongBorder: tokens.input,
            surface: tokens.muted,
          }
        : { ...getProductMarkdownPalette(dark), fontScale },
    [dark, fontScale, tokens],
  );
}

function getProductMarkdownPalette(
  dark: boolean,
): Omit<ProductMarkdownPalette, 'fontScale'> {
  return dark
    ? {
        border: '#27272a',
        foreground: '#f4f4f5',
        link: '#d4d4d8',
        muted: '#a1a1aa',
        placeholder: '#71717a',
        strongBorder: '#3f3f46',
        surface: '#18181b',
      }
    : {
        border: '#e4e4e7',
        foreground: '#18181b',
        link: '#3f3f46',
        muted: '#71717a',
        placeholder: '#a1a1aa',
        strongBorder: '#d4d4d8',
        surface: '#f4f4f5',
      };
}

// 읽기 전용 렌더러의 inline code 스타일이다. react-native-markdown-display 기본값의
// padding 10과 테두리를 지워 줄 높이를 넘지 않는 옅은 배경 칩으로 보이게 한다.
export function getProductInlineCodeStyle(palette: ProductMarkdownPalette) {
  return {
    backgroundColor: palette.surface,
    borderRadius: 4,
    borderWidth: 0,
    color: palette.foreground,
    fontFamily: 'monospace',
    fontSize: scaleMarkdownFont(palette, 12),
    padding: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
  } as const;
}
